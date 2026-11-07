import "./setup-db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { current, enabled } from "./setup-db";
import { admin, cleanup, makeUser } from "./fixtures";

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.skipIf(!enabled)("logging trades with rules (Postgres + RLS)", () => {
  const sql = enabled ? admin() : (null as never);
  const users: string[] = [];
  let u: Awaited<ReturnType<typeof makeUser>>;
  const base = () => ({ accountId: u.accountId, instrumentId: u.niftyId, side: "long", quantity: "1", entry: "24310", exit: "24372", stop: "24280", fees: "40", followedPlan: "yes" });

  beforeAll(async () => {
    u = await makeUser(sql, { tz: "Asia/Kolkata" }); users.push(u.id);
    await sql`insert into trading_rule(user_id, kind, config, enforcement) values (${u.id}, 'max_trades_per_day', '{"max":1}', 'block')`;
    current.userId = u.id;
  });
  afterAll(() => cleanup(sql, users));

  const redirected = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return (e as { url?: string }).url ?? String(e); } };

  it("computes P&L, risk, R and the grade on save", async () => {
    const { createTrade } = await import("@/lib/actions/trades");
    const url = await redirected(createTrade(undefined, form({ ...base(), openedAt: new Date().toISOString() })));
    expect(url).toMatch(/^\/journal\?saved=/);
    const [t] = await sql`select pnl, risk_amount, r_multiple, grade from trade where user_id = ${u.id}`;
    expect([Number(t.pnl), Number(t.risk_amount), Number(t.r_multiple), t.grade]).toEqual([4610, 2250, 2.05, "earned"]);
  });

  it("refuses a second trade today once the limit is reached", async () => {
    const { createTrade } = await import("@/lib/actions/trades");
    const res = await createTrade(undefined, form({ ...base(), openedAt: new Date().toISOString() }));
    expect(res?.error).toMatch(/taken 1 of 1 trades today/);
  });

  it("after an override, asks for acknowledgement, then saves and records a violation", async () => {
    await sql`insert into rule_override(user_id, rule_id, day) select user_id, id, (now() at time zone 'Asia/Kolkata')::date from trading_rule where user_id = ${u.id}`;
    const { createTrade } = await import("@/lib/actions/trades");
    const ask = await createTrade(undefined, form({ ...base(), openedAt: new Date().toISOString() }));
    expect(ask?.needsAck).toMatch(/breaks your own 1-trade-a-day rule/);
    const url = await redirected(createTrade(undefined, form({ ...base(), openedAt: new Date().toISOString(), acknowledgeOverride: "on" })));
    expect(url).toMatch(/^\/journal/);
    const [v] = await sql`select count(*)::int as n from rule_violation where user_id = ${u.id}`;
    expect(v.n).toBe(1);
  });

  it("never blocks back-filling an earlier day", async () => {
    await sql`delete from rule_override where user_id = ${u.id}`;
    const { createTrade } = await import("@/lib/actions/trades");
    const url = await redirected(createTrade(undefined, form({ ...base(), openedAt: "2026-10-01T04:00:00.000Z" })));
    expect(url).toMatch(/^\/journal/);
  });

  it("first real trade removes the sample journal", async () => {
    const fresh = await makeUser(sql); users.push(fresh.id);
    current.userId = fresh.id;
    const { seedDemo } = await import("@/lib/data/demo");
    await seedDemo(fresh.id);
    const [before] = await sql`select count(*)::int as n from trade where user_id = ${fresh.id} and is_demo_data`;
    expect(before.n).toBeGreaterThan(10);
    const { createTrade } = await import("@/lib/actions/trades");
    await redirected(createTrade(undefined, form({ ...base(), accountId: fresh.accountId, instrumentId: fresh.niftyId, openedAt: new Date().toISOString() })));
    const [after] = await sql`select count(*)::int as n from trade where user_id = ${fresh.id} and is_demo_data`;
    expect(after.n).toBe(0);
    current.userId = u.id;
  });
});
