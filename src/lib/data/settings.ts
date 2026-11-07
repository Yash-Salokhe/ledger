import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { dailyAccountStat, profile, ruleOverride, tradingAccount, tradingRule } from "@/lib/db/schema";
import { localNow } from "./gate";

export type SettingsData = Awaited<ReturnType<typeof getSettings>>;

export async function getSettings(userId: string) {
  return withUser(userId, async (tx) => {
    const [p] = await tx.select().from(profile).where(eq(profile.userId, userId));
    const { day } = localNow(p?.timezone ?? "UTC");
    const [accounts, rules, overrides, todayStats] = await Promise.all([
      tx.select().from(tradingAccount).where(and(eq(tradingAccount.userId, userId), isNull(tradingAccount.archivedAt), eq(tradingAccount.isDemoData, false))).orderBy(asc(tradingAccount.createdAt)),
      tx.select().from(tradingRule).where(and(eq(tradingRule.userId, userId), isNull(tradingRule.accountId))),
      tx.select({ ruleId: ruleOverride.ruleId }).from(ruleOverride).where(and(eq(ruleOverride.userId, userId), eq(ruleOverride.day, day))),
      tx.select({ n: dailyAccountStat.tradesCount }).from(dailyAccountStat).where(and(eq(dailyAccountStat.userId, userId), eq(dailyAccountStat.day, day))),
    ]);
    const cfg = (k: string) => rules.find((r) => r.kind === k && r.enabled);
    return {
      profile: { baseCurrency: p?.baseCurrency ?? "USD", timezone: p?.timezone ?? "UTC", defaultRiskPct: Number(p?.defaultRiskPct ?? 1) },
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, broker: a.broker, kind: a.kind, currency: a.currency, openingBalance: Number(a.openingBalance) })),
      rules: {
        enforcement: rules[0]?.enforcement ?? "block",
        maxTrades: (cfg("max_trades_per_day")?.config as { max?: number })?.max,
        maxDailyLoss: (cfg("max_daily_loss")?.config as { amount?: number })?.amount,
        windowStart: (cfg("trading_window")?.config as { start?: string })?.start,
        windowEnd: (cfg("trading_window")?.config as { end?: string })?.end,
        maxRiskPct: (cfg("max_risk_per_trade")?.config as { pct?: number })?.pct,
        list: rules.filter((r) => r.enabled).map((r) => ({ id: r.id, kind: r.kind, config: r.config, overriddenToday: overrides.some((o) => o.ruleId === r.id) })),
      },
      tradesToday: todayStats.reduce((s, r) => s + r.n, 0),
    };
  });
}
