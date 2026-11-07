import { NextRequest } from "next/server";
import { desc, eq, isNull, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { auditLog, instrument, profile, strategy, trade, tradingAccount, tradingRule, weeklyReview } from "@/lib/db/schema";

/**
 * Data portability (DPDP / GDPR): CSV of trades, or a full JSON backup of everything
 * the user created. Streams nothing secret: no auth rows, tokens or audit internals.
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response("Sign in first", { status: 401 });
  const userId = session.user.id;
  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  const stamp = new Date().toISOString().slice(0, 10);

  const data = await withUser(userId, async (tx) => {
    const trades = await tx.select({
      opened_at: trade.openedAt, closed_at: trade.closedAt, account: tradingAccount.name, currency: tradingAccount.currency,
      exchange: instrument.exchange, symbol: instrument.symbol, side: trade.side, quantity: trade.quantity,
      entry: trade.entryPrice, exit: trade.exitPrice, stop: trade.stopPrice, target: trade.targetPrice, fees: trade.fees,
      pnl: trade.pnl, r_multiple: trade.rMultiple, followed_plan: trade.followedPlan, grade: trade.grade,
      strategy: strategy.name, notes: trade.notes,
    }).from(trade)
      .innerJoin(tradingAccount, eq(tradingAccount.id, trade.accountId))
      .innerJoin(instrument, eq(instrument.id, trade.instrumentId))
      .leftJoin(strategy, eq(strategy.id, trade.strategyId))
      .where(and(eq(trade.userId, userId), isNull(trade.deletedAt), eq(trade.isDemoData, false)))
      .orderBy(desc(trade.openedAt));
    if (format === "csv") return { trades };
    const [p, accounts, strategies, rules, reviews] = await Promise.all([
      tx.select().from(profile).where(eq(profile.userId, userId)),
      tx.select().from(tradingAccount).where(eq(tradingAccount.userId, userId)),
      tx.select().from(strategy).where(eq(strategy.userId, userId)),
      tx.select().from(tradingRule).where(eq(tradingRule.userId, userId)),
      tx.select().from(weeklyReview).where(eq(weeklyReview.userId, userId)),
    ]);
    await tx.insert(auditLog).values({ userId, actor: "user", action: "data.export", meta: { format } });
    return { exportedAt: new Date().toISOString(), user: { name: session.user.name, email: session.user.email }, profile: p[0], accounts, strategies, rules, weeklyReviews: reviews, trades };
  });

  if (format === "json") {
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="ledger-backup-${stamp}.json"`, "Cache-Control": "no-store" },
    });
  }
  const cols = Object.keys(data.trades[0] ?? { opened_at: "" });
  const esc = (v: unknown) => {
    const s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    // Quote, and neutralise spreadsheet formula injection (=, +, -, @ at the start of text).
    const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = [cols.join(","), ...data.trades.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ledger-trades-${stamp}.csv"`, "Cache-Control": "no-store" },
  });
}
