import "server-only";
import { and, asc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { instrument, profile, trade, tradingAccount } from "@/lib/db/schema";
import { summarize, type Row } from "@/lib/analytics/summarize";
import type { Grade } from "@/lib/trades/math";

export const RANGES = { "30d": "Last 30 days", "90d": "Last 90 days", ytd: "This year", all: "All time" } as const;
export type Range = keyof typeof RANGES;

export type PerformanceData = NonNullable<Awaited<ReturnType<typeof getPerformance>>>;

/** One indexed query for closed trades in range; everything else is computed by summarize(). */
export async function getPerformance(userId: string, opts: { accountId?: string; range?: string }) {
  const range: Range = opts.range && opts.range in RANGES ? (opts.range as Range) : "90d";
  return withUser(userId, async (tx) => {
    const [p] = await tx.select({ tz: profile.timezone }).from(profile).where(eq(profile.userId, userId));
    const tz = p?.tz ?? "UTC";
    const accounts = await tx.select({ id: tradingAccount.id, name: tradingAccount.name, currency: tradingAccount.currency, opening: tradingAccount.openingBalance })
      .from(tradingAccount).where(and(eq(tradingAccount.userId, userId), isNull(tradingAccount.archivedAt))).orderBy(asc(tradingAccount.createdAt));
    const account = accounts.find((a) => a.id === opts.accountId) ?? accounts[0];
    if (!account) return null;

    const now = new Date();
    const since = range === "30d" ? new Date(now.getTime() - 30 * 864e5)
      : range === "90d" ? new Date(now.getTime() - 90 * 864e5)
      : range === "ytd" ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : null;

    // Balance at the start of the range = opening + everything closed before it.
    const [before] = since
      ? await tx.select({ s: sql<string>`coalesce(sum(${trade.pnl}), 0)` }).from(trade)
          .where(and(eq(trade.accountId, account.id), isNull(trade.deletedAt), isNotNull(trade.pnl), sql`${trade.openedAt} < ${since}`))
      : [{ s: "0" }];

    const local = sql`${trade.openedAt} at time zone ${tz}`;
    const rows = await tx.select({
      pnl: trade.pnl, r: trade.rMultiple, grade: trade.grade, followedPlan: trade.followedPlan, side: trade.side, symbol: instrument.symbol,
      day: sql<string>`to_char(${local}, 'YYYY-MM-DD')`,
      dow: sql<number>`extract(isodow from ${local})::int`,
      hour: sql<number>`extract(hour from ${local})::int`,
    }).from(trade).innerJoin(instrument, eq(instrument.id, trade.instrumentId))
      .where(and(eq(trade.accountId, account.id), isNull(trade.deletedAt), isNotNull(trade.pnl), since ? gte(trade.openedAt, since) : undefined))
      .orderBy(asc(trade.openedAt));

    const data: Row[] = rows.map((r) => ({ ...r, pnl: Number(r.pnl), r: r.r === null ? null : Number(r.r), grade: r.grade as Grade | null }));
    return {
      range, ranges: RANGES, tz,
      account: { id: account.id, name: account.name, currency: account.currency },
      accounts: accounts.map(({ id, name }) => ({ id, name })),
      summary: summarize(data, Number(account.opening) + Number(before.s)),
    };
  });
}
