import "./setup-db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { current, enabled } from "./setup-db";
import { admin, cleanup, makeUser } from "./fixtures";

const MT5 = `Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit
2026.10.14 07:41:00,5001,GBPUSD,buy,1,1.27020,1.26800,,2026.10.14 09:15:00,1.27450,-7.00,0.00,430.00
2026.10.15 08:10:00,5002,EURUSD.raw,sell,0.5,1.09120,1.09300,,2026.10.15 10:00:00,1.09340,-3.50,-1.20,-110.00
2026.10.16 08:10:00,5003,WTIOIL,buy,1,70.10,,,2026.10.16 10:00:00,70.90,0,0,80.00`;

const form = (accountId: string, csv: string, extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.set("accountId", accountId);
  f.set("file", new File([csv], "positions.csv", { type: "text/csv" }));
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
};

describe.skipIf(!enabled)("CSV import (Postgres + RLS)", () => {
  const sql = enabled ? admin() : (null as never);
  const users: string[] = [];
  let u: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => { u = await makeUser(sql); users.push(u.id); current.userId = u.id; });
  afterAll(() => cleanup(sql, users));

  it("previews without writing: detects MT5, matches symbols, flags unknown ones", async () => {
    const { previewImport } = await import("@/lib/actions/import");
    const p = await previewImport(form(u.accountId, MT5));
    expect(p).toMatchObject({ format: "mt5", ready: 2, duplicates: 0, unknownSymbols: ["WTIOIL"], errorCount: 0 });
    const [n] = await sql`select count(*)::int as n from trade where user_id = ${u.id}`;
    expect(n.n).toBe(0);
  });

  it("imports, maps an unknown symbol by hand, and fills the roll-up", async () => {
    const [xau] = await sql`select id from instrument where symbol = 'XAUUSD'`;
    const { commitImport } = await import("@/lib/actions/import");
    const r = await commitImport(form(u.accountId, MT5, { symbolMap: JSON.stringify({ WTIOIL: xau.id }) }));
    expect(r).toMatchObject({ imported: 3, duplicates: 0, skipped: 0 });
    const rows = await sql`select i.symbol, t.quantity::float, t.pnl::float, t.fees::float, t.source from trade t join instrument i on i.id = t.instrument_id where t.user_id = ${u.id} order by t.opened_at`;
    expect(rows.map((x) => [x.symbol, x.quantity, x.pnl, x.fees, x.source])).toEqual([
      ["GBPUSD", 1, 423, 7, "import"], ["EURUSD", 0.5, -114.7, 4.7, "import"], ["XAUUSD", 1, 80, 0, "import"],
    ]);
    const [stat] = await sql`select sum(trades_count)::int as n from daily_account_stat where account_id = ${u.accountId}`;
    expect(stat.n).toBe(3);
  });

  it("re-importing the same file adds nothing", async () => {
    const { previewImport, commitImport } = await import("@/lib/actions/import");
    const p = await previewImport(form(u.accountId, MT5, { symbolMap: JSON.stringify({ WTIOIL: "skip" }) }));
    expect(p).toMatchObject({ ready: 0, duplicates: 2 });
    const r = await commitImport(form(u.accountId, MT5, { symbolMap: JSON.stringify({ WTIOIL: "skip" }) }));
    expect(r).toMatchObject({ imported: 0, skipped: 1 });
    const [n] = await sql`select count(*)::int as n from trade where user_id = ${u.id}`;
    expect(n.n).toBe(3);
  });

  it("refuses non-CSV files and another user's account", async () => {
    const { previewImport } = await import("@/lib/actions/import");
    const bad = new FormData(); bad.set("accountId", u.accountId); bad.set("file", new File(["x"], "photo.png", { type: "image/png" }));
    expect(await previewImport(bad)).toHaveProperty("error");
    const other = await makeUser(sql); users.push(other.id);
    current.userId = other.id;
    expect(await previewImport(form(u.accountId, MT5))).toEqual({ error: "That account no longer exists." });
    current.userId = u.id;
  });
});
