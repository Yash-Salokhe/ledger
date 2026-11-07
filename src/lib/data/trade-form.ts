import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { instrument, profile, strategy, trade, tradingAccount } from "@/lib/db/schema";

export type TradeFormData = Awaited<ReturnType<typeof getTradeFormData>>;

export async function getTradeFormData(userId: string) {
  return withUser(userId, async (tx) => {
    const [accounts, instruments, strategies, [last], [p]] = await Promise.all([
      tx.select({ id: tradingAccount.id, name: tradingAccount.name, currency: tradingAccount.currency, balance: tradingAccount.openingBalance, isDemo: tradingAccount.isDemoData })
        .from(tradingAccount).where(and(eq(tradingAccount.userId, userId), isNull(tradingAccount.archivedAt))).orderBy(asc(tradingAccount.createdAt)),
      tx.select({ id: instrument.id, symbol: instrument.symbol, name: instrument.displayName, exchange: instrument.exchange, assetClass: instrument.assetClass, currency: instrument.quoteCurrency, contractSize: instrument.contractSize })
        .from(instrument).where(eq(instrument.isActive, true)).orderBy(asc(instrument.exchange), asc(instrument.symbol)),
      tx.select({ id: strategy.id, name: strategy.name, checklist: strategy.checklist })
        .from(strategy).where(and(eq(strategy.userId, userId), isNull(strategy.archivedAt))).orderBy(asc(strategy.name)),
      tx.select({ id: trade.instrumentId }).from(trade).where(and(eq(trade.userId, userId), eq(trade.isDemoData, false))).orderBy(desc(trade.createdAt)).limit(1),
      tx.select({ ccy: profile.baseCurrency }).from(profile).where(eq(profile.userId, userId)),
    ]);
    // Default market: the one you traded last; else the first quoted in your account's (or base) currency.
    const ccy = accounts.find((a) => !a.isDemo)?.currency ?? p?.ccy;
    const defaultInstrumentId = last?.id ?? (instruments.find((i) => i.currency === ccy && i.assetClass !== "forex") ?? instruments.find((i) => i.currency === ccy))?.id ?? instruments[0]?.id;
    return {
      accounts: accounts.filter((a) => !a.isDemo).map((a) => ({ ...a, balance: Number(a.balance) })),
      instruments: instruments.map((i) => ({ ...i, contractSize: Number(i.contractSize) })),
      strategies,
      defaultInstrumentId,
    };
  });
}
