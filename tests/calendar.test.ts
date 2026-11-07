import "./setup-db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { current, enabled } from "./setup-db";
import { admin, cleanup, makeUser } from "./fixtures";

describe.skipIf(!enabled)("calendar and day filter (timezone-aware)", () => {
  const sql = enabled ? admin() : (null as never);
  const users: string[] = [];
  let u: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    u = await makeUser(sql, { tz: "Asia/Kolkata" }); users.push(u.id); current.userId = u.id;
    // 2026-10-14 19:45 UTC = 2026-10-15 01:15 IST → belongs to Oct 15 in India.
    const t = async (at: string, pnl: number) => (await sql`insert into trade(user_id, account_id, instrument_id, side, opened_at, quantity, entry_price, pnl, r_multiple, followed_plan)
      values (${u.id}, ${u.accountId}, ${u.niftyId}, 'long', ${at}, 1, 100, ${pnl}, ${pnl / 1000}, true) returning id`)[0].id as string;
    await t("2026-10-14T19:45:00Z", 3000);
    await t("2026-10-15T05:00:00Z", -1000);
    const late = await t("2026-10-20T06:00:00Z", -9000);
    const [rule] = await sql`insert into trading_rule(user_id, kind, config) values (${u.id}, 'max_trades_per_day', '{"max":1}') returning id`;
    await sql`insert into rule_violation(user_id, rule_id, trade_id) values (${u.id}, ${rule.id}, ${late})`;
  });
  afterAll(() => cleanup(sql, users));

  it("groups trades by the user's local day and flags rule-break days", async () => {
    const { getCalendar } = await import("@/lib/data/calendar");
    const c = (await getCalendar(u.id, { month: "2026-10" }))!;
    expect(Object.keys(c.days).sort()).toEqual(["2026-10-15", "2026-10-20"]);
    expect(c.days["2026-10-15"]).toMatchObject({ trades: 2, pnl: 2000 });
    expect(c.days["2026-10-20"].violations).toBe(1);
    expect(c.summary).toMatchObject({ net: -7000, tradingDays: 2, greenDays: 1, best: 2000, worst: -9000, violationDays: 1 });
  });

  it("ignores a bad month and falls back to the current one", async () => {
    const { getCalendar } = await import("@/lib/data/calendar");
    const c = (await getCalendar(u.id, { month: "2026-13'; drop table trade;--" }))!;
    expect(c.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("journal day filter uses the same local day", async () => {
    const { getJournal } = await import("@/lib/data/journal");
    const j = await getJournal(u.id, { day: "2026-10-15" });
    expect(j.rows).toHaveLength(2);
    expect((await getJournal(u.id, { day: "2026-10-14" })).rows).toHaveLength(0);
  });
});
