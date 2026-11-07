import "./setup-db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { current, enabled } from "./setup-db";
import { admin, cleanup, makeUser } from "./fixtures";

describe.skipIf(!enabled)("search (Postgres + RLS)", () => {
  const sql = enabled ? admin() : (null as never);
  const users: string[] = [];
  let u: Awaited<ReturnType<typeof makeUser>>, other: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    u = await makeUser(sql); other = await makeUser(sql); users.push(u.id, other.id);
    const ins = async (who: typeof u, notes: string) => sql`insert into trade(user_id, account_id, instrument_id, side, opened_at, quantity, entry_price, pnl, notes)
      values (${who.id}, ${who.accountId}, ${who.niftyId}, 'long', now(), 1, 100, 50, ${notes})`;
    await ins(u, "Waited for the opening range breakout, clean entry");
    await ins(u, "Revenge trade after the loss");
    await ins(other, "Opening range secret of another user");
    await sql`insert into strategy(user_id, name) values (${u.id}, 'Opening Range Breakout')`;
  });
  afterAll(() => cleanup(sql, users));

  it("finds trades by words in notes (prefix match) and strategies by name", async () => {
    current.userId = u.id;
    const { searchAll } = await import("@/lib/actions/search");
    const hits = await searchAll("opening rang");
    expect(hits.filter((h) => h.kind === "trade")).toHaveLength(1);
    expect(hits.find((h) => h.kind === "strategy")?.title).toBe("Opening Range Breakout");
  });

  it("finds trades by market prefix", async () => {
    const { searchAll } = await import("@/lib/actions/search");
    expect((await searchAll("nif")).filter((h) => h.kind === "trade")).toHaveLength(2);
  });

  it("never returns another user's trades and survives hostile input", async () => {
    const { searchAll } = await import("@/lib/actions/search");
    expect((await searchAll("secret")).length).toBe(0);
    for (const q of ["%", "' or 1=1 --", "a:*|b", "\\", "(((", "nifty & !"]) await expect(searchAll(q)).resolves.toBeInstanceOf(Array);
  });
});
