import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { dailyAccountStat, profile, ruleOverride, tradingAccount, tradingRule } from "@/lib/db/schema";
import { evaluate, type Rule, type Verdict } from "@/lib/rules/engine";

/** Local date (YYYY-MM-DD) and time (HH:MM) for a timezone. */
export function localNow(tz: string, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/**
 * Can the user open a new trade on this account right now?
 * Reads ~3 small rows (rules, today's roll-up, today's overrides) — no trade scan.
 */
export async function getTradeGate(userId: string, accountId?: string): Promise<Verdict & { accountId?: string }> {
  return withUser(userId, async (tx) => {
    const [p] = await tx.select({ tz: profile.timezone }).from(profile).where(eq(profile.userId, userId));
    const tz = p?.tz ?? "UTC";
    const { day, time } = localNow(tz);

    const account = accountId
      ? { id: accountId }
      : (await tx.select({ id: tradingAccount.id }).from(tradingAccount)
          .where(and(eq(tradingAccount.userId, userId), isNull(tradingAccount.archivedAt))).limit(1))[0];
    if (!account) return { canTrade: true, findings: [] };

    const [rules, [stat], overrides] = await Promise.all([
      tx.select().from(tradingRule).where(and(eq(tradingRule.userId, userId), or(isNull(tradingRule.accountId), eq(tradingRule.accountId, account.id)))),
      tx.select().from(dailyAccountStat).where(and(eq(dailyAccountStat.accountId, account.id), eq(dailyAccountStat.day, day))),
      tx.select({ ruleId: ruleOverride.ruleId }).from(ruleOverride).where(and(eq(ruleOverride.userId, userId), eq(ruleOverride.day, day))),
    ]);

    const verdict = evaluate(rules as unknown as Rule[], {
      tradesToday: stat?.tradesCount ?? 0,
      pnlToday: Number(stat?.pnl ?? 0),
      localTime: time,
      overriddenRuleIds: new Set(overrides.map((o) => o.ruleId)),
    });
    return { ...verdict, accountId: account.id };
  });
}
