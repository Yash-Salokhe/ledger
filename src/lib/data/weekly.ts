import "server-only";
import { and, asc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { instrument, profile, ruleOverride, ruleViolation, trade, tradingAccount, tradingRule, weeklyReview } from "@/lib/db/schema";
import { localNow } from "./gate";
import type { Grade } from "@/lib/trades/math";

export type WeeklyData = NonNullable<Awaited<ReturnType<typeof getWeekly>>>;

/** Monday of the week containing `day` (YYYY-MM-DD). */
export function mondayOf(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export async function getWeekly(userId: string, opts: { week?: string; accountId?: string }) {
  return withUser(userId, async (tx) => {
    const [p] = await tx.select({ tz: profile.timezone }).from(profile).where(eq(profile.userId, userId));
    const tz = p?.tz ?? "UTC";
    const thisWeek = mondayOf(localNow(tz).day);
    const week = opts.week && /^\d{4}-\d{2}-\d{2}$/.test(opts.week) ? mondayOf(opts.week) : thisWeek;
    const end = addDays(week, 7);

    const accounts = await tx.select({ id: tradingAccount.id, name: tradingAccount.name, currency: tradingAccount.currency })
      .from(tradingAccount).where(and(eq(tradingAccount.userId, userId), isNull(tradingAccount.archivedAt))).orderBy(asc(tradingAccount.createdAt));
    const account = accounts.find((a) => a.id === opts.accountId) ?? accounts[0];
    if (!account) return null;

    const inWeek = sql`${trade.openedAt} >= (${week}::date::timestamp at time zone ${tz}) and ${trade.openedAt} < (${end}::date::timestamp at time zone ${tz})`;
    const [trades, violations, overrides, [review], [last]] = await Promise.all([
      tx.select({ id: trade.id, symbol: instrument.symbol, side: trade.side, openedAt: trade.openedAt, pnl: trade.pnl, r: trade.rMultiple, grade: trade.grade, followedPlan: trade.followedPlan })
        .from(trade).innerJoin(instrument, eq(instrument.id, trade.instrumentId))
        .where(and(eq(trade.accountId, account.id), isNull(trade.deletedAt), inWeek)).orderBy(asc(trade.openedAt)),
      tx.select({ id: ruleViolation.id, kind: tradingRule.kind, details: ruleViolation.details, tradeId: ruleViolation.tradeId, symbol: instrument.symbol, openedAt: trade.openedAt })
        .from(ruleViolation).innerJoin(tradingRule, eq(tradingRule.id, ruleViolation.ruleId))
        .innerJoin(trade, eq(trade.id, ruleViolation.tradeId)).innerJoin(instrument, eq(instrument.id, trade.instrumentId))
        .where(and(eq(trade.accountId, account.id), inWeek)),
      tx.select({ day: ruleOverride.day, reason: ruleOverride.reason, kind: tradingRule.kind })
        .from(ruleOverride).innerJoin(tradingRule, eq(tradingRule.id, ruleOverride.ruleId))
        .where(and(eq(ruleOverride.userId, userId), sql`${ruleOverride.day} >= ${week}::date and ${ruleOverride.day} < ${end}::date`)).orderBy(asc(ruleOverride.day)),
      tx.select().from(weeklyReview).where(and(eq(weeklyReview.userId, userId), eq(weeklyReview.accountId, account.id), eq(weeklyReview.weekStart, week))),
      tx.select({ focusNext: weeklyReview.focusNext }).from(weeklyReview)
        .where(and(eq(weeklyReview.userId, userId), eq(weeklyReview.accountId, account.id), eq(weeklyReview.weekStart, addDays(week, -7)), isNotNull(weeklyReview.focusNext))),
    ]);

    const closed = trades.filter((t) => t.pnl !== null).map((t) => ({ ...t, pnl: Number(t.pnl), r: t.r === null ? null : Number(t.r), openedAt: t.openedAt.toISOString(), grade: t.grade as Grade | null }));
    const rs = closed.map((t) => t.r).filter((r): r is number => r !== null);
    const graded = closed.filter((t) => t.followedPlan !== null);
    const byPnl = [...closed].sort((a, b) => b.pnl - a.pnl);
    const grades = { earned: 0, lucky: 0, good_loss: 0, deserved: 0 } as Record<Grade, number>;
    for (const t of closed) if (t.grade) grades[t.grade]++;

    return {
      week, end: addDays(week, 6), prev: addDays(week, -7), next: week < thisWeek ? addDays(week, 7) : null, isCurrent: week === thisWeek,
      account, accounts,
      stats: {
        trades: trades.length,
        net: closed.reduce((s, t) => s + t.pnl, 0),
        winRate: closed.length ? (closed.filter((t) => t.pnl > 0).length / closed.length) * 100 : null,
        avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
        onPlan: graded.length ? (graded.filter((t) => t.followedPlan).length / graded.length) * 100 : null,
        ungraded: closed.filter((t) => !t.grade).length,
      },
      grades,
      best: byPnl[0] && byPnl[0].pnl > 0 ? byPnl[0] : null,
      worst: byPnl.at(-1) && byPnl.at(-1)!.pnl < 0 ? byPnl.at(-1)! : null,
      violations: violations.map((v) => ({ id: v.id, kind: v.kind, tradeId: v.tradeId, symbol: v.symbol, openedAt: v.openedAt.toISOString(), overridden: Boolean((v.details as { overridden?: boolean }).overridden), title: String((v.details as { title?: string }).title ?? v.kind) })),
      overrides,
      review: { wentWell: review?.wentWell ?? "", toImprove: review?.toImprove ?? "", focusNext: review?.focusNext ?? "" },
      lastFocus: last?.focusNext ?? null,
    };
  });
}
