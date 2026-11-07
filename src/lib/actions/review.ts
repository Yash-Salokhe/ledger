"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { auditLog, instrument, strategy, trade, tradeAttachment } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";
import { pnl, riskAmount, rMultiple } from "@/lib/trades/math";
import { EMOTIONS } from "@/lib/trades/emotions";


const Patch = z.object({
  id: z.guid(),
  version: z.number().int().positive(),
  followedPlan: z.boolean().nullable().optional(),
  grade: z.enum(["earned", "good_loss", "lucky", "deserved"]).nullable().optional(),
  strategyId: z.guid().nullable().optional(),
  checklistMet: z.array(z.string().max(64)).max(50).optional(),
  emotions: z.array(z.enum(EMOTIONS)).max(EMOTIONS.length).optional(),
  notes: z.string().max(10000).optional(),
  // Editing the numbers recomputes P&L, risk and R on the server.
  quantity: z.number().positive().optional(),
  entry: z.number().positive().optional(),
  exit: z.number().positive().nullable().optional(),
  stop: z.number().positive().nullable().optional(),
  target: z.number().positive().nullable().optional(),
  fees: z.number().min(0).optional(),
});

export type ReviewResult =
  | { ok: true; version: number; pnl: number | null; r: number | null; risk: number | null }
  | { ok: false; conflict?: true; error: string };

/**
 * Saves part of a trade review. Uses optimistic concurrency: the client sends the
 * version it edited; if another tab saved first, nothing is overwritten.
 */
export async function updateTradeReview(input: z.input<typeof Patch>): Promise<ReviewResult> {
  const { user } = await requireSession();
  const p = Patch.safeParse(input);
  if (!p.success) return { ok: false, error: "That change isn't valid." };
  const { id, version, ...patch } = p.data;

  return withUser(user.id, async (tx) => {
    const [cur] = await tx.select({ t: trade, cs: instrument.contractSize }).from(trade)
      .innerJoin(instrument, eq(instrument.id, trade.instrumentId))
      .where(and(eq(trade.id, id), eq(trade.userId, user.id), isNull(trade.deletedAt)));
    if (!cur) return { ok: false, error: "This trade no longer exists." };
    if (cur.t.version !== version) return { ok: false, conflict: true, error: "This trade changed in another tab. Reload to see the latest." };

    if (patch.strategyId) {
      const [s] = await tx.select({ id: strategy.id }).from(strategy).where(and(eq(strategy.id, patch.strategyId), eq(strategy.userId, user.id)));
      if (!s) return { ok: false, error: "That plan no longer exists." };
    }

    const set: Partial<typeof trade.$inferInsert> = {};
    if (patch.followedPlan !== undefined) set.followedPlan = patch.followedPlan;
    if (patch.grade !== undefined) set.grade = patch.grade;
    if (patch.strategyId !== undefined) { set.strategyId = patch.strategyId; set.checklistMet = []; }
    if (patch.checklistMet) set.checklistMet = patch.checklistMet;
    if (patch.emotions) set.emotions = patch.emotions;
    if (patch.notes !== undefined) set.notes = patch.notes || null;

    const numbersChanged = ["quantity", "entry", "exit", "stop", "target", "fees"].some((k) => k in patch);
    let out = { pnl: cur.t.pnl === null ? null : Number(cur.t.pnl), r: cur.t.rMultiple === null ? null : Number(cur.t.rMultiple), risk: cur.t.riskAmount === null ? null : Number(cur.t.riskAmount) };
    if (numbersChanged) {
      const q = patch.quantity ?? Number(cur.t.quantity);
      const e = patch.entry ?? Number(cur.t.entryPrice);
      const x = patch.exit === undefined ? (cur.t.exitPrice === null ? null : Number(cur.t.exitPrice)) : patch.exit;
      const s = patch.stop === undefined ? (cur.t.stopPrice === null ? null : Number(cur.t.stopPrice)) : patch.stop;
      const f = patch.fees ?? Number(cur.t.fees);
      const cs = Number(cur.cs);
      const net = x === null ? null : pnl({ side: cur.t.side, quantity: q, entry: e, exit: x, contractSize: cs, fees: f });
      const risk = riskAmount({ side: cur.t.side, quantity: q, entry: e, stop: s ?? undefined, contractSize: cs }) ?? null;
      const r = net === null ? null : rMultiple(net, risk ?? undefined) ?? null;
      Object.assign(set, {
        quantity: String(q), entryPrice: String(e), exitPrice: x === null ? null : String(x), stopPrice: s === null ? null : String(s),
        targetPrice: patch.target === undefined ? cur.t.targetPrice : patch.target === null ? null : String(patch.target),
        fees: String(f), pnl: net === null ? null : String(net), riskAmount: risk === null ? null : String(risk), rMultiple: r === null ? null : String(r),
        status: x === null ? "open" : "closed", closedAt: x === null ? null : cur.t.closedAt ?? new Date(),
      });
      out = { pnl: net, r, risk };
    }
    if (!Object.keys(set).length) return { ok: true, version, ...out };

    const [row] = await tx.update(trade).set(set).where(and(eq(trade.id, id), eq(trade.version, version))).returning({ version: trade.version });
    if (!row) return { ok: false, conflict: true, error: "This trade changed in another tab. Reload to see the latest." };
    await tx.insert(auditLog).values({ userId: user.id, actor: "user", action: "trade.review", entity: "trade", entityId: id, meta: { fields: Object.keys(set) } });
    revalidatePath(`/trades/${id}`);
    return { ok: true, version: row.version, ...out };
  });
}

/** Attach a TradingView chart link. Only https://www.tradingview.com/… is accepted. */
export async function addChartLink(tradeId: string, url: string) {
  const { user } = await requireSession();
  let u: URL;
  try { u = new URL(url.trim()); } catch { return { error: "Paste a full link that starts with https://" }; }
  if (u.protocol !== "https:" || !/(^|\.)tradingview\.com$/.test(u.hostname)) return { error: "Only TradingView links can be attached here." };
  await withUser(user.id, async (tx) => {
    const [t] = await tx.select({ id: trade.id }).from(trade).where(and(eq(trade.id, tradeId), eq(trade.userId, user.id)));
    if (t) await tx.insert(tradeAttachment).values({ userId: user.id, tradeId, kind: "tradingview_link", url: u.toString() });
  });
  revalidatePath(`/trades/${tradeId}`);
  return { ok: true };
}

export async function removeAttachment(id: string, tradeId: string) {
  const { user } = await requireSession();
  await withUser(user.id, (tx) => tx.delete(tradeAttachment).where(and(eq(tradeAttachment.id, id), eq(tradeAttachment.userId, user.id))));
  revalidatePath(`/trades/${tradeId}`);
}
