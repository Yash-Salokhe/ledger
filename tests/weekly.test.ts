import "./setup-db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { current, enabled } from "./setup-db";
import { admin, cleanup, makeUser } from "./fixtures";
import { mondayOf } from "@/lib/data/weekly";

describe("mondayOf", () => {
  it("finds the Monday of any day", () => {
    expect(mondayOf("2026-11-04")).toBe("2026-11-02"); // Wed
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // Sun
    expect(mondayOf("2026-11-02")).toBe("2026-11-02"); // Mon
  });
});

describe.skipIf(!enabled)("weekly review (Postgres + RLS)", () => {
  const sql = enabled ? admin() : (null as never);
  const users: string[] = [];
  let u: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    u = await makeUser(sql, { tz: "Asia/Kolkata" }); users.push(u.id); current.userId = u.id;
    const t = async (at: string, pnl: number, grade: string, followed: boolean) => (await sql`insert into trade(user_id, account_id, instrument_id, side, opened_at, quantity, entry_price, pnl, r_multiple, grade, followed_plan)
      values (${u.id}, ${u.accountId}, ${u.niftyId}, 'long', ${at}, 1, 100, ${pnl}, ${pnl / 1000}, ${grade}, ${followed}) returning id`)[0].id as string;
    await t("2026-10-05T04:00:00Z", 2000, "earned", true); // Mon 5 Oct IST
    const broke = await t("2026-10-07T04:00:00Z", -1500, "deserved", false);
    await t("2026-10-12T04:00:00Z", 999, "earned", true); // next week
    const [rule] = await sql`insert into trading_rule(user_id, kind, config) values (${u.id}, 'max_trades_per_day', '{"max":1}') returning id`;
    await sql`insert into rule_violation(user_id, rule_id, trade_id, details) values (${u.id}, ${rule.id}, ${broke}, ${sql.json({ title: "x", overridden: true })})`;
    await sql`insert into rule_override(user_id, rule_id, day, reason) values (${u.id}, ${rule.id}, '2026-10-07', 'news day')`;
    await sql`insert into weekly_review(user_id, account_id, week_start, focus_next) values (${u.id}, ${u.accountId}, '2026-09-28', 'Wait for the close')`;
  });
  afterAll(() => cleanup(sql, users));

  it("summarises one week in the user's timezone with last week's focus", async () => {
    const { getWeekly } = await import("@/lib/data/weekly");
    const w = (await getWeekly(u.id, { week: "2026-10-08" }))!;
    expect(w.week).toBe("2026-10-05");
    expect(w.stats).toMatchObject({ trades: 2, net: 500, winRate: 50, onPlan: 50 });
    expect(w.grades).toEqual({ earned: 1, lucky: 0, good_loss: 0, deserved: 1 });
    expect(w.best?.pnl).toBe(2000);
    expect(w.worst?.pnl).toBe(-1500);
    expect(w.violations).toHaveLength(1);
    expect(w.overrides[0]).toMatchObject({ reason: "news day", kind: "max_trades_per_day" });
    expect(w.lastFocus).toBe("Wait for the close");
  });

  it("autosaves reflections with an upsert and rejects non-Monday weeks", async () => {
    const { saveReflection } = await import("@/lib/actions/weekly");
    expect(await saveReflection({ accountId: u.accountId, weekStart: "2026-10-05", field: "wentWell", value: "Patience" })).toEqual({ ok: true });
    expect(await saveReflection({ accountId: u.accountId, weekStart: "2026-10-05", field: "focusNext", value: "One trade a day" })).toEqual({ ok: true });
    const rows = await sql`select went_well, focus_next from weekly_review where user_id = ${u.id} and week_start = '2026-10-05'`;
    expect(rows).toEqual([{ went_well: "Patience", focus_next: "One trade a day" }]);
    expect(await saveReflection({ accountId: u.accountId, weekStart: "2026-10-06", field: "wentWell", value: "x" })).toHaveProperty("error");
  });
});
