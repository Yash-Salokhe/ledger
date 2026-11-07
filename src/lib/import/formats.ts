/**
 * Turns broker exports into round-trip trades. Pure: no database, fully unit-tested.
 * Supported: MetaTrader 5 "Positions" history, Zerodha tradebook (fills paired FIFO),
 * and any CSV through a column mapping.
 */
import { parseDate, parseNumber } from "./csv";

export type Format = "mt5" | "zerodha" | "generic";
export type Field = "symbol" | "side" | "openedAt" | "closedAt" | "quantity" | "entry" | "exit" | "stop" | "target" | "fees" | "pnl" | "id";
export type Mapping = Partial<Record<Field, number>>; // field → column index

export type ParsedTrade = {
  externalId: string;
  symbol: string;
  side: "long" | "short";
  openedAt: Date;
  closedAt: Date | null;
  /** In instrument units (shares, coins, currency units). Converted to lots on save. */
  units: number | null;
  /** In lots as exported (MT5 volume). Exactly one of units / lots is set. */
  lots: number | null;
  entry: number;
  exit: number | null;
  stop: number | null;
  target: number | null;
  fees: number;
  /** Broker-reported net P&L in account currency, when the export has it. */
  pnl: number | null;
};
export type RowError = { row: number; message: string };
export type ParseResult = { trades: ParsedTrade[]; errors: RowError[]; format: Format };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function detectFormat(header: string[]): Format {
  const h = header.map(norm);
  if (h.includes("position") && h.includes("symbol") && h.includes("volume") && h.filter((x) => x === "price").length >= 2) return "mt5";
  if (h.includes("tradetype") && h.includes("tradeid") && h.includes("symbol") && (h.includes("orderexecutiontime") || h.includes("tradedate"))) return "zerodha";
  return "generic";
}

/** Best-guess column mapping for generic CSVs; the user confirms it in the UI. */
export function guessMapping(header: string[]): Mapping {
  const h = header.map(norm);
  const find = (...names: string[]) => { const i = h.findIndex((x) => names.includes(x)); return i >= 0 ? i : undefined; };
  return {
    symbol: find("symbol", "ticker", "instrument", "market", "pair", "tradingsymbol"),
    side: find("side", "direction", "type", "action", "buysell"),
    openedAt: find("opentime", "openedat", "entrytime", "entrydate", "opendate", "date", "time", "datetime"),
    closedAt: find("closetime", "closedat", "exittime", "exitdate", "closedate"),
    quantity: find("quantity", "qty", "size", "volume", "lots", "units", "shares"),
    entry: find("entry", "entryprice", "openprice", "price", "buyprice"),
    exit: find("exit", "exitprice", "closeprice", "sellprice"),
    stop: find("stop", "stoploss", "sl"),
    target: find("target", "takeprofit", "tp"),
    fees: find("fees", "commission", "charges", "brokerage"),
    pnl: find("pnl", "profit", "netpnl", "realizedpnl", "profitloss", "netprofit"),
    id: find("id", "tradeid", "ticket", "position", "orderid"),
  };
}

const side = (raw: string): "long" | "short" | null => {
  const s = norm(raw);
  if (["buy", "long", "b", "bought", "buytoopen"].includes(s)) return "long";
  if (["sell", "short", "s", "sold", "selltoopen", "sellshort"].includes(s)) return "short";
  return null;
};

/** Stable id so the same row imported twice is recognised (unique on account + source + external id). */
async function stableId(parts: (string | number | null)[]) {
  const data = new TextEncoder().encode(parts.join("|"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function parseTrades(rows: string[][], opts: { tz: string; format?: Format; mapping?: Mapping }): Promise<ParseResult> {
  const [header, ...body] = rows;
  if (!header) return { trades: [], errors: [{ row: 1, message: "The file is empty." }], format: "generic" };
  const format = opts.format ?? detectFormat(header);
  if (format === "mt5") return { ...(await mt5(header, body, opts.tz)), format };
  // Zerodha timestamps are NSE/BSE exchange time (IST) whatever the user's own timezone is.
  if (format === "zerodha") return { ...(await zerodha(header, body, "Asia/Kolkata")), format };
  return { ...(await generic(body, opts.mapping ?? guessMapping(header), opts.tz)), format };
}

/** MT5 → Toolbox → History → Positions → Save as report (CSV). Two "Time" and two "Price" columns: open, close. */
async function mt5(header: string[], body: string[][], tz: string) {
  const h = header.map(norm);
  const idx = (name: string, nth = 0) => h.reduce<number[]>((a, x, i) => (x === name ? [...a, i] : a), [])[nth];
  const c = { open: idx("time", 0), pos: idx("position"), sym: idx("symbol"), type: idx("type"), vol: idx("volume"), pin: idx("price", 0), sl: idx("sl"), tp: idx("tp"), close: idx("time", 1), pout: idx("price", 1), com: idx("commission"), swap: idx("swap"), profit: idx("profit") };
  const trades: ParsedTrade[] = [], errors: RowError[] = [];
  for (const [k, r] of body.entries()) {
    const row = k + 2;
    const t = side(r[c.type] ?? "");
    if (!t) continue; // MT5 reports append summary lines; ignore anything that isn't a buy/sell position
    const openedAt = parseDate(r[c.open] ?? "", tz), closedAt = parseDate(r[c.close] ?? "", tz);
    const vol = parseNumber(r[c.vol] ?? ""), pin = parseNumber(r[c.pin] ?? ""), pout = parseNumber(r[c.pout] ?? "");
    if (!openedAt || !(vol > 0) || !(pin > 0)) { errors.push({ row, message: "Missing open time, volume or price." }); continue; }
    const fees = -((parseNumber(r[c.com] ?? "") || 0) + (parseNumber(r[c.swap] ?? "") || 0)); // MT5 shows costs as negatives
    const profit = parseNumber(r[c.profit] ?? "");
    trades.push({
      externalId: `mt5:${r[c.pos] || (await stableId(r))}`, symbol: r[c.sym].replace(/[.\-_](raw|ecn|pro|m|i)$/i, "").toUpperCase(), side: t,
      openedAt, closedAt, units: null, lots: vol, entry: pin, exit: pout > 0 ? pout : null,
      stop: parseNumber(r[c.sl] ?? "") || null, target: parseNumber(r[c.tp] ?? "") || null,
      fees: Number.isFinite(fees) ? fees : 0, pnl: Number.isFinite(profit) ? profit - fees : null,
    });
  }
  return { trades, errors };
}

/** Zerodha Console → Reports → Tradebook (CSV). Each row is a fill; pair them FIFO per symbol into round trips. */
async function zerodha(header: string[], body: string[][], tz: string) {
  const h = header.map(norm);
  const at = (n: string) => h.indexOf(n);
  const c = { sym: at("symbol"), type: at("tradetype"), qty: at("quantity"), price: at("price"), id: at("tradeid"), time: at("orderexecutiontime") >= 0 ? at("orderexecutiontime") : at("tradedate") };
  const errors: RowError[] = [];
  type Fill = { row: number; id: string; sym: string; side: "long" | "short"; qty: number; price: number; at: Date };
  const fills: Fill[] = [];
  for (const [k, r] of body.entries()) {
    const s = side(r[c.type] ?? ""), at2 = parseDate(r[c.time] ?? "", tz), qty = parseNumber(r[c.qty] ?? ""), price = parseNumber(r[c.price] ?? "");
    if (!s || !at2 || !(qty > 0) || !(price > 0)) { errors.push({ row: k + 2, message: "Unreadable fill (type, time, quantity or price)." }); continue; }
    fills.push({ row: k + 2, id: r[c.id] || String(k), sym: r[c.sym].toUpperCase(), side: s, qty, price, at: at2 });
  }
  fills.sort((a, b) => +a.at - +b.at);

  const trades: ParsedTrade[] = [];
  const open = new Map<string, { side: "long" | "short"; lots: { qty: number; price: number; at: Date; id: string }[] }>();
  for (const f of fills) {
    const book = open.get(f.sym);
    if (!book || book.lots.length === 0 || book.side === f.side) {
      const b = book && book.lots.length ? book : { side: f.side, lots: [] };
      b.side = f.side; b.lots.push({ qty: f.qty, price: f.price, at: f.at, id: f.id }); open.set(f.sym, b);
      continue;
    }
    // Opposite side: close against the oldest open lots first (FIFO).
    let remaining = f.qty;
    while (remaining > 0 && book.lots.length) {
      const lot = book.lots[0], q = Math.min(lot.qty, remaining);
      trades.push({
        externalId: `zerodha:${lot.id}:${f.id}`, symbol: f.sym, side: book.side, openedAt: lot.at, closedAt: f.at,
        units: q, lots: null, entry: lot.price, exit: f.price, stop: null, target: null, fees: 0, pnl: null,
      });
      lot.qty -= q; remaining -= q;
      if (lot.qty === 0) book.lots.shift();
    }
    if (remaining > 0) open.set(f.sym, { side: f.side, lots: [{ qty: remaining, price: f.price, at: f.at, id: f.id }] }); // flipped position
  }
  for (const [sym, b] of open) for (const lot of b.lots) {
    trades.push({ externalId: `zerodha:${lot.id}:open`, symbol: sym, side: b.side, openedAt: lot.at, closedAt: null, units: lot.qty, lots: null, entry: lot.price, exit: null, stop: null, target: null, fees: 0, pnl: null });
  }
  return { trades, errors };
}

async function generic(body: string[][], m: Mapping, tz: string) {
  const trades: ParsedTrade[] = [], errors: RowError[] = [];
  const get = (r: string[], f: Field) => (m[f] === undefined ? "" : r[m[f]!] ?? "");
  const missing = (["symbol", "side", "openedAt", "quantity", "entry"] as Field[]).filter((f) => m[f] === undefined);
  if (missing.length) return { trades, errors: [{ row: 1, message: `Map these columns first: ${missing.join(", ")}.` }] };
  for (const [k, r] of body.entries()) {
    const row = k + 2;
    const s = side(get(r, "side")), openedAt = parseDate(get(r, "openedAt"), tz);
    const qty = parseNumber(get(r, "quantity")), entry = parseNumber(get(r, "entry"));
    if (!get(r, "symbol")) { errors.push({ row, message: "No symbol." }); continue; }
    if (!s) { errors.push({ row, message: `Side "${get(r, "side")}" isn't buy/sell or long/short.` }); continue; }
    if (!openedAt) { errors.push({ row, message: `Couldn't read the date "${get(r, "openedAt")}".` }); continue; }
    if (!(qty > 0) || !(entry > 0)) { errors.push({ row, message: "Quantity and entry must be positive numbers." }); continue; }
    const num = (f: Field) => { const v = parseNumber(get(r, f)); return Number.isFinite(v) && get(r, f) !== "" ? v : null; };
    trades.push({
      externalId: `csv:${get(r, "id") || (await stableId([get(r, "symbol"), get(r, "side"), get(r, "openedAt"), get(r, "quantity"), get(r, "entry"), get(r, "exit")]))}`,
      symbol: get(r, "symbol").toUpperCase(), side: s, openedAt, closedAt: parseDate(get(r, "closedAt"), tz),
      units: null, lots: qty, entry, exit: num("exit"), stop: num("stop"), target: num("target"), fees: Math.abs(num("fees") ?? 0), pnl: num("pnl"),
    });
  }
  return { trades, errors };
}
