import "./setup-db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { current, enabled } from "./setup-db";
import { admin, cleanup, makeUser } from "./fixtures";

describe.skipIf(!enabled)("trade review (Postgres + RLS)", () => {
  const sql = enabled ? admin() : (null as never);
  const users: string[] = [];
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let tradeId = "";

  beforeAll(async () => {
    owner = await makeUser(sql); users.push(owner.id);
    const [t] = await sql`insert into trade(user_id, account_id, instrument_id, side, opened_at, quantity, entry_price, exit_price, stop_price, pnl, followed_plan)
      values (${owner.id}, ${owner.accountId}, ${owner.niftyId}, 'long', now() - interval '2 days', 1, 24300, 24360, 24270, 4500, true) returning id`;
    tradeId = t.id;
  });
  afterAll(() => cleanup(sql, users));

  it("saves a grade and bumps the version", async () => {
    current.userId = owner.id;
    const { updateTradeReview } = await import("@/lib/actions/review");
    const r = await updateTradeReview({ id: tradeId, version: 1, grade: "earned", emotions: ["Calm"] });
    expect(r).toMatchObject({ ok: true, version: 2 });
    const [row] = await sql`select grade, emotions from trade where id = ${tradeId}`;
    expect(row).toEqual({ grade: "earned", emotions: ["Calm"] });
  });

  it("refuses a stale version instead of overwriting (two tabs)", async () => {
    const { updateTradeReview } = await import("@/lib/actions/review");
    const r = await updateTradeReview({ id: tradeId, version: 1, grade: "lucky" });
    expect(r).toMatchObject({ ok: false, conflict: true });
    const [row] = await sql`select grade from trade where id = ${tradeId}`;
    expect(row.grade).toBe("earned");
  });

  it("recomputes P&L, risk and R when numbers change", async () => {
    const { updateTradeReview } = await import("@/lib/actions/review");
    const r = await updateTradeReview({ id: tradeId, version: 2, exit: 24400, fees: 40 });
    // (24400 − 24300) × 75 − 40 = 7460 ; risk (24300 − 24270) × 75 = 2250 ; R = 3.32
    expect(r).toMatchObject({ ok: true, pnl: 7460, risk: 2250, r: 3.32 });
    const [stat] = await sql`select pnl from daily_account_stat where account_id = ${owner.accountId}`;
    expect(Number(stat.pnl)).toBe(7460); // roll-up followed the edit
  });

  it("another user cannot read or edit the trade", async () => {
    const intruder = await makeUser(sql); users.push(intruder.id);
    current.userId = intruder.id;
    const { updateTradeReview } = await import("@/lib/actions/review");
    const { getTradeDetail } = await import("@/lib/data/trade");
    expect(await getTradeDetail(intruder.id, tradeId)).toBeNull();
    expect(await updateTradeReview({ id: tradeId, version: 3, grade: "deserved" })).toMatchObject({ ok: false });
  });

  it("only accepts TradingView chart links", async () => {
    current.userId = owner.id;
    const { addChartLink } = await import("@/lib/actions/review");
    expect(await addChartLink(tradeId, "https://evil.example.com/x")).toHaveProperty("error");
    expect(await addChartLink(tradeId, "javascript:alert(1)")).toHaveProperty("error");
    expect(await addChartLink(tradeId, "https://www.tradingview.com/x/AbC123/")).toEqual({ ok: true });
  });
});
