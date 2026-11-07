"use server";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { instrument, strategy, trade, tradingAccount } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

export type SearchHit =
  | { kind: "trade"; id: string; title: string; detail: string; pnl: number | null; currency: string; href: string }
  | { kind: "strategy"; id: string; title: string; detail: string; href: string };

/** Trades by market (prefix) or by words in notes (full-text index), plus strategies by name. RLS-scoped. */
export async function searchAll(raw: string): Promise<SearchHit[]> {
  const { user } = await requireSession();
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const like = `${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  const tsq = words.length ? words.map((w) => `${w}:*`).join(" & ") : null;

  return withUser(user.id, async (tx) => {
    const [trades, strategies] = await Promise.all([
      tx.select({ id: trade.id, symbol: instrument.symbol, side: trade.side, openedAt: trade.openedAt, pnl: trade.pnl, notes: trade.notes, currency: tradingAccount.currency })
        .from(trade).innerJoin(instrument, eq(instrument.id, trade.instrumentId)).innerJoin(tradingAccount, eq(tradingAccount.id, trade.accountId))
        .where(and(eq(trade.userId, user.id), isNull(trade.deletedAt), or(
          ilike(instrument.symbol, like),
          tsq ? sql`to_tsvector('simple', coalesce(${trade.notes}, '')) @@ to_tsquery('simple', ${tsq})` : undefined,
        )))
        .orderBy(desc(trade.openedAt)).limit(6),
      tx.select({ id: strategy.id, name: strategy.name, description: strategy.description }).from(strategy)
        .where(and(eq(strategy.userId, user.id), isNull(strategy.archivedAt), ilike(strategy.name, `%${like}`))).limit(4),
    ]);
    return [
      ...trades.map((t): SearchHit => ({
        kind: "trade", id: t.id, href: `/trades/${t.id}`, currency: t.currency, pnl: t.pnl === null ? null : Number(t.pnl),
        title: `${t.symbol} ${t.side === "long" ? "Buy" : "Sell"}`,
        detail: `${t.openedAt.toISOString().slice(0, 10)}${t.notes ? ` · ${t.notes.slice(0, 60)}` : ""}`,
      })),
      ...strategies.map((s): SearchHit => ({ kind: "strategy", id: s.id, href: `/playbook/${s.id}`, title: s.name, detail: s.description?.slice(0, 60) ?? "Strategy" })),
    ];
  });
}
