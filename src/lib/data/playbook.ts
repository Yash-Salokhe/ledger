import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { instrument, strategy, trade, tradingAccount } from "@/lib/db/schema";

/** Aggregates every strategy in one grouped query (no N+1). */
const statCols = {
  n: sql<number>`count(${trade.id})::int`,
  wins: sql<number>`count(*) filter (where ${trade.pnl} > 0)::int`,
  avgR: sql<string | null>`round(avg(${trade.rMultiple}), 2)`,
  onPlan: sql<number>`count(*) filter (where ${trade.followedPlan})::int`,
  graded: sql<number>`count(*) filter (where ${trade.followedPlan} is not null)::int`,
};
const shape = (s: { n: number; wins: number; avgR: string | null; onPlan: number; graded: number }) => ({
  trades: s.n,
  winRate: s.n ? (s.wins / s.n) * 100 : null,
  avgR: s.avgR === null ? null : Number(s.avgR),
  adherence: s.graded ? (s.onPlan / s.graded) * 100 : null,
});

export async function getPlaybook(userId: string) {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({ id: strategy.id, name: strategy.name, description: strategy.description, checklist: strategy.checklist, isDemo: strategy.isDemoData, ...statCols })
      .from(strategy)
      .leftJoin(trade, and(eq(trade.strategyId, strategy.id), isNull(trade.deletedAt)))
      .where(and(eq(strategy.userId, userId), isNull(strategy.archivedAt)))
      .groupBy(strategy.id)
      .orderBy(desc(sql`count(${trade.id})`), asc(strategy.name));
    return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, steps: r.checklist.length, isDemo: r.isDemo, ...shape(r) }));
  });
}

export type StrategyDetail = NonNullable<Awaited<ReturnType<typeof getStrategy>>>;

export async function getStrategy(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return withUser(userId, async (tx) => {
    const [s] = await tx.select().from(strategy).where(and(eq(strategy.id, id), eq(strategy.userId, userId)));
    if (!s) return null;
    const live = and(eq(trade.strategyId, id), isNull(trade.deletedAt));

    // For each checklist step: how did trades do when the step was met vs skipped?
    // Step ids are [a-z0-9-] (validated on save), so a comma-joined bound parameter is safe.
    const stepStats = s.checklist.length
      ? await tx.execute<{ step: string; met_n: number; met_r: string | null; skip_n: number; skip_r: string | null }>(sql`
          select c.step,
                 count(*) filter (where t.checklist_met ? c.step)::int as met_n,
                 round(avg(t.r_multiple) filter (where t.checklist_met ? c.step), 2) as met_r,
                 count(*) filter (where not (t.checklist_met ? c.step))::int as skip_n,
                 round(avg(t.r_multiple) filter (where not (t.checklist_met ? c.step)), 2) as skip_r
            from unnest(string_to_array(${s.checklist.map((c) => c.id).join(",")}, ',')) as c(step)
            left join ${trade} t on t.strategy_id = ${id} and t.deleted_at is null
           group by c.step`)
      : [];

    const [[agg], recent] = await Promise.all([
      tx.select({ ...statCols, net: sql<string>`coalesce(sum(${trade.pnl}), 0)` }).from(trade).where(live),
      tx.select({ id: trade.id, symbol: instrument.symbol, side: trade.side, openedAt: trade.openedAt, r: trade.rMultiple, pnl: trade.pnl, grade: trade.grade, currency: tradingAccount.currency })
        .from(trade).innerJoin(instrument, eq(instrument.id, trade.instrumentId)).innerJoin(tradingAccount, eq(tradingAccount.id, trade.accountId))
        .where(live).orderBy(desc(trade.openedAt)).limit(8),
    ]);

    const byStep = new Map([...stepStats].map((r) => [r.step, r]));
    return {
      id: s.id, name: s.name, description: s.description ?? "", isDemo: s.isDemoData,
      checklist: s.checklist.map((c) => {
        const r = byStep.get(c.id);
        return { ...c, metN: r?.met_n ?? 0, metR: r?.met_r == null ? null : Number(r.met_r), skipN: r?.skip_n ?? 0, skipR: r?.skip_r == null ? null : Number(r.skip_r) };
      }),
      stats: shape(agg),
      recent: recent.map((t) => ({ ...t, openedAt: t.openedAt.toISOString(), r: t.r === null ? null : Number(t.r), pnl: t.pnl === null ? null : Number(t.pnl) })),
    };
  });
}
