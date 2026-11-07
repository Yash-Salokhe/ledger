import { describe, expect, it } from "vitest";
import { parseCsv, parseNumber, parseDate, detectDelimiter } from "./csv";
import { detectFormat, guessMapping, parseTrades } from "./formats";

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi""\nthere"\r\n\r\n2,,z');
    expect(rows).toEqual([["a", "b", "c"], ["1", "x, y", 'say "hi"\nthere'], ["2", "", "z"]]);
  });
  it("detects semicolon and tab delimiters", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(parseCsv("a;b\n1,5;2")).toEqual([["a", "b"], ["1,5", "2"]]);
  });
});

describe("parseNumber / parseDate", () => {
  it.each([["1,234.50", 1234.5], ["1.234,50", 1234.5], ["12,5", 12.5], ["(25)", -25], ["₹ 1,200", 1200], ["-0.5", -0.5], ["", NaN]])("%s → %s", (s, n) => {
    expect(parseNumber(s)).toEqual(n);
  });
  it("reads MT5, ISO and day-first Indian dates in the given timezone", () => {
    expect(parseDate("2026.10.14 09:30:05", "UTC")?.toISOString()).toBe("2026-10-14T09:30:05.000Z");
    expect(parseDate("14-10-2026 09:30", "Asia/Kolkata")?.toISOString()).toBe("2026-10-14T04:00:00.000Z");
    expect(parseDate("2026-10-14T09:30:00Z", "Asia/Kolkata")?.toISOString()).toBe("2026-10-14T09:30:00.000Z");
    expect(parseDate("2026-03-08 03:30", "America/New_York")?.toISOString()).toBe("2026-03-08T07:30:00.000Z"); // after DST jump
    expect(parseDate("31/02/2026 25:00", "UTC")).toBeNull();
  });
});

const MT5 = `Time,Position,Symbol,Type,Volume,Price,S / L,T / P,Time,Price,Commission,Swap,Profit
2026.10.14 07:41:00,5001,GBPUSD,buy,1,1.27020,1.26800,1.27600,2026.10.14 09:15:00,1.27450,-7.00,0.00,430.00
2026.10.15 08:10:00,5002,EURUSD.raw,sell,0.5,1.09120,1.09300,,2026.10.15 10:00:00,1.09340,-3.50,-1.20,-110.00
Balance:,,,,,,,,,,,,10319.30`;

describe("MT5 positions report", () => {
  it("is detected and parsed, with costs folded into net P&L", async () => {
    const rows = parseCsv(MT5);
    expect(detectFormat(rows[0])).toBe("mt5");
    const { trades, errors } = await parseTrades(rows, { tz: "UTC" });
    expect(errors).toEqual([]);
    expect(trades).toHaveLength(2); // summary line ignored
    expect(trades[0]).toMatchObject({ externalId: "mt5:5001", symbol: "GBPUSD", side: "long", lots: 1, entry: 1.2702, exit: 1.2745, stop: 1.268, target: 1.276, fees: 7, pnl: 423 });
    expect(trades[1]).toMatchObject({ symbol: "EURUSD", side: "short", lots: 0.5, target: null, fees: 4.7, pnl: -114.7 });
  });
});

const ZERODHA = `symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time
INFY,INE009A01021,2026-10-14,NSE,EQ,EQ,buy,false,10,1500.00,T1,O1,2026-10-14T09:20:00
INFY,INE009A01021,2026-10-14,NSE,EQ,EQ,buy,false,5,1510.00,T2,O2,2026-10-14T09:40:00
INFY,INE009A01021,2026-10-14,NSE,EQ,EQ,sell,false,12,1530.00,T3,O3,2026-10-14T14:00:00
TCS,INE467B01029,2026-10-15,NSE,EQ,EQ,sell,false,4,4000.00,T4,O4,2026-10-15T10:00:00
TCS,INE467B01029,2026-10-15,NSE,EQ,EQ,buy,false,4,3980.00,T5,O5,2026-10-15T11:00:00`;

describe("Zerodha tradebook", () => {
  it("pairs fills FIFO into round trips and keeps the remainder open", async () => {
    const rows = parseCsv(ZERODHA);
    expect(detectFormat(rows[0])).toBe("zerodha");
    const { trades, errors } = await parseTrades(rows, { tz: "Asia/Kolkata" });
    expect(errors).toEqual([]);
    const pick = (t: (typeof trades)[number]) => [t.symbol, t.side, t.units, t.entry, t.exit];
    expect(trades.map(pick)).toEqual([
      ["INFY", "long", 10, 1500, 1530], // first 10 from the 09:20 buy
      ["INFY", "long", 2, 1510, 1530], // next 2 from the 09:40 buy
      ["TCS", "short", 4, 4000, 3980], // short sold first, covered later
      ["INFY", "long", 3, 1510, null], // 3 still open
    ]);
    expect(trades[0].openedAt.toISOString()).toBe("2026-10-14T03:50:00.000Z"); // 09:20 IST
  });
  it("reads tradebook times as IST even for a user in another timezone", async () => {
    const { trades } = await parseTrades(parseCsv(ZERODHA), { tz: "America/Phoenix" });
    expect(trades[0].openedAt.toISOString()).toBe("2026-10-14T03:50:00.000Z");
  });
});

describe("generic CSV", () => {
  const CSV = `Date,Ticker,Action,Qty,Entry Price,Exit Price,Commission,Notes
2026-10-14 10:00,AAPL,Buy,10,190.5,192.25,1,good
2026-10-14 11:00,TSLA,hold,5,250,,,
bad-date,NVDA,Sell,2,120,118,,`;
  it("guesses the mapping and reports row errors in plain words", async () => {
    const rows = parseCsv(CSV);
    expect(detectFormat(rows[0])).toBe("generic");
    expect(guessMapping(rows[0])).toMatchObject({ openedAt: 0, symbol: 1, side: 2, quantity: 3, entry: 4, exit: 5, fees: 6 });
    const { trades, errors } = await parseTrades(rows, { tz: "UTC" });
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: "AAPL", side: "long", lots: 10, entry: 190.5, exit: 192.25, fees: 1 });
    expect(errors.map((e) => e.row)).toEqual([3, 4]);
    expect(errors[0].message).toMatch(/hold/);
  });
  it("gives the same id to the same row (re-imports are deduplicated)", async () => {
    const a = await parseTrades(parseCsv(CSV), { tz: "UTC" });
    const b = await parseTrades(parseCsv(CSV), { tz: "UTC" });
    expect(a.trades[0].externalId).toBe(b.trades[0].externalId);
  });
});
