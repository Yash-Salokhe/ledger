import "server-only";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { instrument, profile, strategy, trade, tradingAccount } from "@/lib/db/schema";

const PAGE = 50;

/** Keyset pagination on (opened_at): page N costs the same as page 1, even at 100k trades. */
export async function getJournal(userId: string, opts: { before?: Date; day?: string } = {}) {
  const { before } = opts;
  const day = opts.day && /^\d{4}-\d{2}-\d{2}$/.test(opts.day) ? opts.day : undefined;
  return withUser(userId, async (tx) => {
    // A calendar day is a day in the user's timezone, not UTC.
    const [p] = day ? await tx.select({ tz: profile.timezone }).from(profile).where(eq(profile.userId, userId)) : [];
    const tz = p?.tz ?? "UTC";
    const dayFilter = day
      ? sql`${trade.openedAt} >= (${day}::date::timestamp at time zone ${tz}) and ${trade.openedAt} < ((${day}::date + 1)::timestamp at time zone ${tz})`
      : undefined;
    const rows = await tx
      .select({
        id: trade.id, openedAt: trade.openedAt, side: trade.side, status: trade.status,
        symbol: instrument.symbol, exchange: instrument.exchange, strategy: strategy.name,
        pnl: trade.pnl, r: trade.rMultiple, grade: trade.grade, followedPlan: trade.followedPlan,
        currency: tradingAccount.currency, account: tradingAccount.name, isDemo: trade.isDemoData,
      })
      .from(trade)
      .innerJoin(instrument, eq(instrument.id, trade.instrumentId))
      .innerJoin(tradingAccount, eq(tradingAccount.id, trade.accountId))
      .leftJoin(strategy, eq(strategy.id, trade.strategyId))
      .where(and(eq(trade.userId, userId), isNull(trade.deletedAt), before ? lt(trade.openedAt, before) : undefined, dayFilter))
      .orderBy(desc(trade.openedAt))
      .limit(PAGE + 1);
    return { day, rows: rows.slice(0, PAGE), nextCursor: rows.length > PAGE ? rows[PAGE - 1].openedAt.toISOString() : null };
  });
}
