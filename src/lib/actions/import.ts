"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { auditLog, instrument, profile, trade, tradeImport, tradingAccount } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";
import { parseCsv } from "@/lib/import/csv";
import { guessMapping, parseTrades, type Format, type Mapping, type ParsedTrade } from "@/lib/import/formats";
import { pnl as calcPnl, riskAmount, rMultiple } from "@/lib/trades/math";
import { clearDemo } from "@/lib/data/demo";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20000;

const Opts = z.object({
  accountId: z.guid(),
  format: z.enum(["auto", "mt5", "zerodha", "generic"]).default("auto"),
  mapping: z.string().optional(), // JSON Mapping for generic files
  symbolMap: z.string().optional(), // JSON { SYMBOL: instrumentId | "skip" }
});

export type ImportPreview =
  | { error: string }
  | {
      format: Format; header: string[]; mapping: Mapping; total: number; ready: number; duplicates: number;
      errors: { row: number; message: string }[]; errorCount: number;
      unknownSymbols: string[];
      sample: { symbol: string; side: string; openedAt: string; qty: number; entry: number; exit: number | null; pnl: number | null }[];
    };

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

async function read(form: FormData): Promise<Fail | { ok: true; rows: string[][]; name: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV file to import.");
  if (file.size > MAX_BYTES) return fail("That file is over 5 MB. Export a shorter date range and import it in parts.");
  if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) return fail("Ledger reads CSV files. Export your history as CSV and try again.");
  const rows = parseCsv(await file.text());
  if (rows.length > MAX_ROWS + 1) return fail(`That file has more than ${MAX_ROWS.toLocaleString()} rows. Import it in parts.`);
  return { ok: true, rows, name: file.name };
}

type Resolved = { id: string; symbol: string; cs: string };
type Prepared = {
  ok: true; acct: { id: string }; parsed: Awaited<ReturnType<typeof parseTrades>>; header: string[]; name: string;
  resolve: (sym: string) => Resolved | null | undefined; existing: Set<string | null>; mapping: Mapping;
};

async function prepare(userId: string, form: FormData): Promise<Fail | Prepared> {
  const o = Opts.safeParse(Object.fromEntries([...form].filter(([k]) => k !== "file")));
  if (!o.success) return fail("Choose an account to import into.");
  const file = await read(form);
  if (!file.ok) return file;
  const mapping: Mapping | undefined = o.data.mapping ? JSON.parse(o.data.mapping) : undefined;
  const symbolMap: Record<string, string> = o.data.symbolMap ? JSON.parse(o.data.symbolMap) : {};

  return withUser(userId, async (tx): Promise<Fail | Prepared> => {
    const [acct] = await tx.select().from(tradingAccount).where(and(eq(tradingAccount.id, o.data.accountId), eq(tradingAccount.userId, userId)));
    if (!acct) return fail("That account no longer exists.");
    const [p] = await tx.select({ tz: profile.timezone }).from(profile).where(eq(profile.userId, userId));
    const parsed = await parseTrades(file.rows, { tz: p?.tz ?? "UTC", format: o.data.format === "auto" ? undefined : o.data.format, mapping });

    const symbols = [...new Set(parsed.trades.map((t) => t.symbol))];
    const known = symbols.length
      ? await tx.select({ id: instrument.id, symbol: instrument.symbol, cs: instrument.contractSize }).from(instrument).where(inArray(sql`upper(${instrument.symbol})`, symbols))
      : [];
    const bySymbol = new Map(known.map((k) => [k.symbol.toUpperCase(), k]));
    const allInstruments = Object.values(symbolMap).some((v) => v !== "skip")
      ? await tx.select({ id: instrument.id, symbol: instrument.symbol, cs: instrument.contractSize }).from(instrument).where(inArray(instrument.id, Object.values(symbolMap).filter((v) => v !== "skip")))
      : [];
    const byId = new Map(allInstruments.map((k) => [k.id, k]));
    const resolve = (sym: string): Resolved | null | undefined => {
      const m = symbolMap[sym];
      if (m === "skip") return null;
      if (m && byId.has(m)) return byId.get(m)!;
      return bySymbol.get(sym) ?? undefined; // undefined = unknown, null = skipped by the user
    };

    const existing = parsed.trades.length
      ? new Set((await tx.select({ id: trade.externalId }).from(trade)
          .where(and(eq(trade.accountId, acct.id), eq(trade.source, "import"), inArray(trade.externalId, parsed.trades.map((t) => t.externalId))))).map((r) => r.id))
      : new Set<string | null>();

    return { ok: true, acct, parsed, header: file.rows[0] ?? [], name: file.name, resolve, existing, mapping: mapping ?? guessMapping(file.rows[0] ?? []) };
  });
}

export async function previewImport(form: FormData): Promise<ImportPreview> {
  const { user } = await requireSession();
  const r = await prepare(user.id, form);
  if (!r.ok) return { error: r.error };
  const { parsed, resolve, existing } = r;
  const unknown = [...new Set(parsed.trades.filter((t) => resolve(t.symbol) === undefined).map((t) => t.symbol))];
  const importable = parsed.trades.filter((t) => resolve(t.symbol));
  return {
    format: parsed.format, header: r.header, mapping: r.mapping,
    total: parsed.trades.length + parsed.errors.length,
    ready: importable.filter((t) => !existing.has(t.externalId)).length,
    duplicates: importable.filter((t) => existing.has(t.externalId)).length,
    errors: parsed.errors.slice(0, 20), errorCount: parsed.errors.length,
    unknownSymbols: unknown,
    sample: parsed.trades.slice(0, 5).map((t) => ({ symbol: t.symbol, side: t.side, openedAt: t.openedAt.toISOString(), qty: t.lots ?? t.units ?? 0, entry: t.entry, exit: t.exit, pnl: t.pnl })),
  };
}

export type ImportResult = { error: string } | { imported: number; duplicates: number; skipped: number; errors: number; importId: string };

export async function commitImport(form: FormData): Promise<ImportResult> {
  const { user } = await requireSession();
  const r = await prepare(user.id, form);
  if (!r.ok) return { error: r.error };
  const { acct, parsed, resolve, existing } = r;

  return withUser(user.id, async (tx) => {
    const [job] = await tx.insert(tradeImport).values({
      userId: user.id, accountId: acct.id, format: parsed.format, fileName: r.name, status: "processing",
      rowsTotal: parsed.trades.length + parsed.errors.length, columnMapping: parsed.format === "generic" ? (r.mapping as Record<string, string>) : null,
      errors: parsed.errors.slice(0, 200),
    }).returning({ id: tradeImport.id });

    const rows = [];
    let skipped = 0;
    for (const t of parsed.trades) {
      const ins = resolve(t.symbol);
      if (!ins) { skipped++; continue; }
      if (existing.has(t.externalId)) continue;
      rows.push(toRow(t, { userId: user.id, accountId: acct.id, instrumentId: ins.id, contractSize: Number(ins.cs), importId: job.id }));
    }
    let imported = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const res = await tx.insert(trade).values(rows.slice(i, i + 500)).onConflictDoNothing().returning({ id: trade.id });
      imported += res.length;
    }
    const duplicates = parsed.trades.length - skipped - imported;
    await tx.update(tradeImport).set({ status: "completed", rowsImported: imported, rowsSkipped: skipped + duplicates + parsed.errors.length, completedAt: new Date() }).where(eq(tradeImport.id, job.id));
    if (imported) await clearDemo(tx, user.id);
    await tx.insert(auditLog).values({ userId: user.id, actor: "user", action: "trades.import", entity: "trade_import", entityId: job.id, meta: { format: parsed.format, imported, duplicates, skipped } });
    return { imported, duplicates, skipped, errors: parsed.errors.length, importId: job.id };
  });
}

function toRow(t: ParsedTrade, o: { userId: string; accountId: string; instrumentId: string; contractSize: number; importId: string }) {
  // Quantity is stored in lots/contracts/shares, like a manually logged trade.
  const quantity = t.lots ?? (t.units ?? 0) / (o.contractSize || 1);
  const net = t.pnl ?? (t.exit !== null ? calcPnl({ side: t.side, quantity, entry: t.entry, exit: t.exit, contractSize: o.contractSize, fees: t.fees }) : null);
  const risk = t.stop !== null ? riskAmount({ side: t.side, quantity, entry: t.entry, stop: t.stop, contractSize: o.contractSize }) : undefined;
  return {
    userId: o.userId, accountId: o.accountId, instrumentId: o.instrumentId, side: t.side,
    status: t.exit !== null ? ("closed" as const) : ("open" as const),
    openedAt: t.openedAt, closedAt: t.closedAt, quantity: String(quantity),
    entryPrice: String(t.entry), exitPrice: t.exit === null ? null : String(t.exit),
    stopPrice: t.stop === null ? null : String(t.stop), targetPrice: t.target === null ? null : String(t.target),
    fees: String(t.fees), pnl: net === null ? null : String(Math.round(net * 1e4) / 1e4),
    riskAmount: risk === undefined ? null : String(risk), rMultiple: net !== null && risk ? String(rMultiple(net, risk)) : null,
    source: "import" as const, externalId: t.externalId, importId: o.importId,
  };
}
