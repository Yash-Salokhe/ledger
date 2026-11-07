import "./setup-db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { current, enabled } from "./setup-db";
import { admin, cleanup, makeUser } from "./fixtures";

describe.skipIf(!enabled)("playbook (Postgres + RLS)", () => {
  const sql = enabled ? admin() : (null as never);
  const users: string[] = [];
  let u: Awaited<ReturnType<typeof makeUser>>;
  let sid = "";

  beforeAll(async () => {
    u = await makeUser(sql); users.push(u.id); current.userId = u.id;
    const [s] = await sql`insert into strategy(user_id, name, checklist) values (${u.id}, 'ORB',
      ${sql.json([{ id: "close", label: "Waited for the close" }, { id: "risk", label: "Risked 1%" }])}) returning id`;
    sid = s.id;
    // close met: +2, +1 ; close skipped: -1, -1, -0.5 ; risk met on all
    const rows: [number, string[]][] = [[2, ["close", "risk"]], [1, ["close", "risk"]], [-1, ["risk"]], [-1, ["risk"]], [-0.5, ["risk"]]];
    for (const [r, met] of rows) {
      await sql`insert into trade(user_id, account_id, instrument_id, strategy_id, side, opened_at, quantity, entry_price, pnl, r_multiple, checklist_met, followed_plan)
        values (${u.id}, ${u.accountId}, ${u.niftyId}, ${sid}, 'long', now(), 1, 100, ${r * 100}, ${r}, ${sql.json(met)}, ${met.length === 2})`;
    }
  });
  afterAll(() => cleanup(sql, users));

  it("splits average R by checklist step followed vs skipped", async () => {
    const { getStrategy } = await import("@/lib/data/playbook");
    const s = (await getStrategy(u.id, sid))!;
    const close = s.checklist.find((c) => c.id === "close")!;
    expect([close.metN, close.metR, close.skipN, close.skipR]).toEqual([2, 1.5, 3, -0.83]);
    expect(s.stats).toMatchObject({ trades: 5, winRate: 40, avgR: 0.1, adherence: 40 });
  });

  it("lists strategies with grouped stats", async () => {
    const { getPlaybook } = await import("@/lib/data/playbook");
    const [p] = await getPlaybook(u.id);
    expect(p).toMatchObject({ name: "ORB", trades: 5, steps: 2 });
  });

  it("rejects bad or duplicate step ids", async () => {
    const { saveStrategy } = await import("@/lib/actions/playbook");
    expect(await saveStrategy(sid, { name: "ORB", checklist: [{ id: "x'; drop table trade;--", label: "x" }] })).toHaveProperty("error");
    expect(await saveStrategy(sid, { name: "ORB", checklist: [{ id: "a", label: "1" }, { id: "a", label: "2" }] })).toHaveProperty("error");
    expect(await saveStrategy(sid, { name: "ORB v2", checklist: [{ id: "close", label: "Waited for the close" }] })).toEqual({ ok: true });
  });
});
