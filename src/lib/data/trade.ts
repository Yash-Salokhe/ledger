import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { instrument, ruleViolation, strategy, trade, tradeAttachment, tradingAccount, tradingRule } from "@/lib/db/schema";

export type TradeDetail = NonNullable<Awaited<ReturnType<typeof getTradeDetail>>>;

/** One trade with everything the review screen shows. Null when it doesn't exist or isn't yours (RLS). */
export async function getTradeDetail(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select({ t: trade, i: instrument, a: tradingAccount, s: strategy })
      .from(trade)
      .innerJoin(instrument, eq(instrument.id, trade.instrumentId))
      .innerJoin(tradingAccount, eq(tradingAccount.id, trade.accountId))
      .leftJoin(strategy, eq(strategy.id, trade.strategyId))
      .where(and(eq(trade.id, id), eq(trade.userId, userId), isNull(trade.deletedAt)));
    if (!row) return null;

    const [violations, attachments, strategies] = await Promise.all([
      tx.select({ id: ruleViolation.id, kind: tradingRule.kind, details: ruleViolation.details })
        .from(ruleViolation).innerJoin(tradingRule, eq(tradingRule.id, ruleViolation.ruleId))
        .where(eq(ruleViolation.tradeId, id)),
      tx.select().from(tradeAttachment).where(eq(tradeAttachment.tradeId, id)).orderBy(asc(tradeAttachment.createdAt)),
      tx.select({ id: strategy.id, name: strategy.name }).from(strategy)
        .where(and(eq(strategy.userId, userId), isNull(strategy.archivedAt))).orderBy(asc(strategy.name)),
    ]);

    const { t, i, a, s } = row;
    const num = (v: string | null) => (v === null ? null : Number(v));
    return {
      id: t.id, version: t.version, side: t.side, status: t.status,
      openedAt: t.openedAt.toISOString(), closedAt: t.closedAt?.toISOString() ?? null,
      quantity: Number(t.quantity), entry: Number(t.entryPrice), exit: num(t.exitPrice), stop: num(t.stopPrice), target: num(t.targetPrice),
      fees: Number(t.fees), pnl: num(t.pnl), risk: num(t.riskAmount), r: num(t.rMultiple),
      followedPlan: t.followedPlan, grade: t.grade, checklistMet: t.checklistMet, emotions: t.emotions, notes: t.notes ?? "",
      source: t.source, isDemo: t.isDemoData,
      instrument: { symbol: i.symbol, name: i.displayName, exchange: i.exchange, assetClass: i.assetClass, contractSize: Number(i.contractSize) },
      account: { name: a.name, currency: a.currency },
      strategy: s ? { id: s.id, name: s.name, checklist: s.checklist } : null,
      strategies,
      violations: violations.map((v) => ({ id: v.id, kind: v.kind, title: String((v.details as { title?: string }).title ?? v.kind), overridden: Boolean((v.details as { overridden?: boolean }).overridden) })),
      attachments: attachments.map((x) => ({ id: x.id, kind: x.kind, url: x.url })),
    };
  });
}
