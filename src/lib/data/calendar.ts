import "server-only";
import { and, asc, between, eq, isNull, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { dailyAccountStat, profile, ruleViolation, trade, tradingAccount } from "@/lib/db/schema";
import { localNow } from "./gate";

export type CalendarData = NonNullable<Awaited<ReturnType<typeof getCalendar>>>;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** One month of daily results for one account, from the roll-up table (one indexed range read). */
export async function getCalendar(userId: string, opts: { month?: string; accountId?: string }) {
  return withUser(userId, async (tx) => {
    const [p] = await tx.select({ tz: profile.timezone }).from(profile).where(eq(profile.userId, userId));
    const tz = p?.tz ?? "UTC";
    const today = localNow(tz).day;
    const month = opts.month && MONTH.test(opts.month) ? opts.month : today.slice(0, 7);

    const accounts = await tx.select({ id: tradingAccount.id, name: tradingAccount.name, currency: tradingAccount.currency })
      .from(tradingAccount).where(and(eq(tradingAccount.userId, userId), isNull(tradingAccount.archivedAt))).orderBy(asc(tradingAccount.createdAt));
    const account = accounts.find((a) => a.id === opts.accountId) ?? accounts[0];
    if (!account) return null;

    const [y, m] = month.split("-").map(Number);
    const first = `${month}-01`;
    const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;

    const [days, violations] = await Promise.all([
      tx.select({ day: dailyAccountStat.day, n: dailyAccountStat.tradesCount, wins: dailyAccountStat.wins, losses: dailyAccountStat.losses, pnl: dailyAccountStat.pnl, r: dailyAccountStat.rSum, onPlan: dailyAccountStat.onPlanCount })
        .from(dailyAccountStat).where(and(eq(dailyAccountStat.accountId, account.id), between(dailyAccountStat.day, first, last))),
      tx.select({ day: sql<string>`to_char(${trade.openedAt} at time zone ${tz}, 'YYYY-MM-DD')`, n: sql<number>`count(distinct ${ruleViolation.id})::int` })
        .from(ruleViolation).innerJoin(trade, eq(trade.id, ruleViolation.tradeId))
        .where(and(eq(trade.accountId, account.id), sql`(${trade.openedAt} at time zone ${tz})::date between ${first}::date and ${last}::date`))
        .groupBy(sql`1`),
    ]);

    const vmap = new Map(violations.map((v) => [v.day, v.n]));
    const byDay = new Map(days.map((d) => [d.day, { trades: d.n, wins: d.wins, losses: d.losses, pnl: Number(d.pnl), r: Number(d.r), onPlan: d.onPlan, violations: vmap.get(d.day) ?? 0 }]));
    const maxAbs = Math.max(1, ...[...byDay.values()].map((d) => Math.abs(d.pnl)));
    const pnls = [...byDay.values()].map((d) => d.pnl);

    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    return {
      month, today, first, last, prev, next: next > today.slice(0, 7) ? null : next,
      account, accounts, maxAbs,
      days: Object.fromEntries(byDay),
      summary: {
        net: pnls.reduce((s, x) => s + x, 0),
        tradingDays: pnls.length,
        greenDays: pnls.filter((x) => x > 0).length,
        best: pnls.length ? Math.max(...pnls) : null,
        worst: pnls.length ? Math.min(...pnls) : null,
        violationDays: [...vmap.values()].filter(Boolean).length,
      },
    };
  });
}
