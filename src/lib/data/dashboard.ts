import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { dailyAccountStat, instrument, trade, tradingAccount } from "@/lib/db/schema";

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

/**
 * Everything the dashboard needs in one transaction and four indexed queries.
 * Totals come from SQL aggregates; the equity curve from the daily roll-up,
 * so cost does not grow with the number of trades shown.
 */
export async function getDashboard(userId: string) {
  return withUser(userId, async (tx) => {
    const [account] = await tx.select().from(tradingAccount)
      .where(and(eq(tradingAccount.userId, userId), isNull(tradingAccount.archivedAt)))
      .orderBy(asc(tradingAccount.createdAt)).limit(1);
    if (!account) return null;

    const live = and(eq(trade.accountId, account.id), isNull(trade.deletedAt));
    const [[totals], days, recent, byInstrument] = await Promise.all([
      tx.select({
        n: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) filter (where ${trade.pnl} > 0)::int`,
        losses: sql<number>`count(*) filter (where ${trade.pnl} < 0)::int`,
        net: sql<string>`coalesce(sum(${trade.pnl}), 0)`,
        grossWin: sql<string>`coalesce(sum(${trade.pnl}) filter (where ${trade.pnl} > 0), 0)`,
        grossLoss: sql<string>`coalesce(-sum(${trade.pnl}) filter (where ${trade.pnl} < 0), 0)`,
        onPlan: sql<number>`count(*) filter (where ${trade.followedPlan})::int`,
        graded: sql<number>`count(*) filter (where ${trade.followedPlan} is not null)::int`,
      }).from(trade).where(live),
      tx.select({ day: dailyAccountStat.day, pnl: dailyAccountStat.pnl }).from(dailyAccountStat)
        .where(eq(dailyAccountStat.accountId, account.id)).orderBy(asc(dailyAccountStat.day)),
      tx.select({ id: trade.id, symbol: instrument.symbol, side: trade.side, openedAt: trade.openedAt, pnl: trade.pnl, r: trade.rMultiple, grade: trade.grade })
        .from(trade).innerJoin(instrument, eq(instrument.id, trade.instrumentId))
        .where(live).orderBy(desc(trade.openedAt)).limit(5),
      tx.select({ symbol: instrument.symbol, n: sql<number>`count(*)::int`, pnl: sql<string>`coalesce(sum(${trade.pnl}),0)` })
        .from(trade).innerJoin(instrument, eq(instrument.id, trade.instrumentId))
        .where(live).groupBy(instrument.symbol).orderBy(desc(sql`count(*)`)).limit(4),
    ]);

    const opening = Number(account.openingBalance);
    let running = opening;
    const curve = [opening, ...days.map((d) => (running += Number(d.pnl)))];
    const net = Number(totals.net);

    return {
      account: { id: account.id, name: account.name, currency: account.currency },
      isDemo: account.isDemoData,
      opening,
      balance: opening + net,
      changePct: opening ? (net / opening) * 100 : 0,
      trades: totals.n,
      winRate: totals.n ? (totals.wins / totals.n) * 100 : 0,
      wins: totals.wins,
      losses: totals.losses,
      profitFactor: Number(totals.grossLoss) ? Number(totals.grossWin) / Number(totals.grossLoss) : null,
      expectancy: totals.n ? net / totals.n : 0,
      planAdherence: totals.graded ? (totals.onPlan / totals.graded) * 100 : null,
      curve,
      recent,
      byInstrument: byInstrument.map((b) => ({ ...b, pnl: Number(b.pnl) })),
    };
  });
}
