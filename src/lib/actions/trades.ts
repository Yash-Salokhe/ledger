"use server";
import { and, eq, isNull, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withUser } from "@/lib/db";
import {
  auditLog, dailyAccountStat, instrument, profile, ruleOverride, ruleViolation, trade, tradingAccount, tradingRule,
} from "@/lib/db/schema";
import { requireSession } from "@/lib/session";
import { evaluate, type Rule } from "@/lib/rules/engine";
import { localNow } from "@/lib/data/gate";
import { clearDemo, seedDemo } from "@/lib/data/demo";
import { pnl, riskAmount, rMultiple, suggestGrade } from "@/lib/trades/math";

const num = z.coerce.number().finite();
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : v), num.optional());

const TradeInput = z.object({
  accountId: z.guid().optional(),
  // Inline first-account setup (shown when the user has no account yet)
  newAccountName: z.string().trim().max(80).optional(),
  newAccountCurrency: z.string().length(3).optional(),
  newAccountBalance: optNum,
  instrumentId: z.guid(),
  strategyId: z.preprocess((v) => (v === "" ? undefined : v), z.guid().optional()),
  side: z.enum(["long", "short"]),
  openedAt: z.coerce.date(),
  quantity: num.positive(),
  entry: num.positive(),
  exit: optNum,
  stop: optNum,
  target: optNum,
  fees: optNum,
  followedPlan: z.enum(["yes", "no"]),
  grade: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["earned", "good_loss", "lucky", "deserved"]).optional()),
  notes: z.string().max(10000).optional(),
  acknowledgeOverride: z.preprocess((v) => (v === "" ? undefined : v), z.literal("on").optional()),
});

export type TradeFormState = { ok?: false; error?: string; fieldErrors?: Record<string, string>; needsAck?: string } | undefined;

/**
 * Saves a manually logged trade. The rules engine runs here again — the browser
 * check is only for instant feedback and is never trusted.
 */
export async function createTrade(_: TradeFormState, form: FormData): Promise<TradeFormState> {
  const { user } = await requireSession();
  const parsed = TradeInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= "Check this value.";
    return { error: "Some fields need attention.", fieldErrors };
  }
  const t = parsed.data;

  const result = await withUser(user.id, async (tx) => {
    // 1. Account: existing, or create the first real one inline.
    let accountId = t.accountId;
    if (!accountId) {
      if (!t.newAccountName || !t.newAccountCurrency) return { error: "Name your trading account first.", fieldErrors: { newAccountName: "Required" } };
      const [a] = await tx.insert(tradingAccount).values({
        userId: user.id, name: t.newAccountName, currency: t.newAccountCurrency.toUpperCase(),
        openingBalance: String(t.newAccountBalance ?? 0),
      }).returning({ id: tradingAccount.id });
      accountId = a.id;
    }
    const [acct] = await tx.select().from(tradingAccount).where(and(eq(tradingAccount.id, accountId), eq(tradingAccount.userId, user.id)));
    if (!acct) return { error: "That account no longer exists." };
    const [ins] = await tx.select().from(instrument).where(eq(instrument.id, t.instrumentId));
    if (!ins) return { error: "Pick a market." };

    // 2. Maths
    const cs = Number(ins.contractSize);
    const net = t.exit !== undefined ? pnl({ side: t.side, quantity: t.quantity, entry: t.entry, exit: t.exit, contractSize: cs, fees: t.fees }) : undefined;
    const risk = riskAmount({ side: t.side, quantity: t.quantity, entry: t.entry, stop: t.stop, contractSize: cs });
    const followed = t.followedPlan === "yes";

    // 3. Rules — only for trades opened today (back-filling old trades is never blocked).
    const [p] = await tx.select({ tz: profile.timezone }).from(profile).where(eq(profile.userId, user.id));
    const tz = p?.tz ?? "UTC";
    const today = localNow(tz);
    const openedDay = localNow(tz, t.openedAt).day;
    let findings: ReturnType<typeof evaluate>["findings"] = [];
    if (openedDay === today.day && !acct.isDemoData) {
      const [rules, [stat], overrides] = await Promise.all([
        tx.select().from(tradingRule).where(and(eq(tradingRule.userId, user.id), or(isNull(tradingRule.accountId), eq(tradingRule.accountId, acct.id)))),
        tx.select().from(dailyAccountStat).where(and(eq(dailyAccountStat.accountId, acct.id), eq(dailyAccountStat.day, today.day))),
        tx.select({ ruleId: ruleOverride.ruleId }).from(ruleOverride).where(and(eq(ruleOverride.userId, user.id), eq(ruleOverride.day, today.day))),
      ]);
      const balance = Number(acct.openingBalance);
      const v = evaluate(rules as unknown as Rule[], {
        tradesToday: stat?.tradesCount ?? 0, pnlToday: Number(stat?.pnl ?? 0), localTime: today.time,
        overriddenRuleIds: new Set(overrides.map((o) => o.ruleId)),
      }, { riskPct: risk && balance ? Math.round((risk / balance) * 10000) / 100 : undefined });
      if (!v.canTrade) return { error: `${v.lockReason}. Change or override the rule in Settings to log this trade.` };
      findings = v.findings;
      const broken = findings.find((f) => f.overridden || f.severity === "warn");
      if (broken && !t.acknowledgeOverride) return { needsAck: broken.message };
    }

    // 4. Save
    const [row] = await tx.insert(trade).values({
      userId: user.id, accountId: acct.id, instrumentId: ins.id, strategyId: t.strategyId,
      side: t.side, status: t.exit !== undefined ? "closed" : "open", openedAt: t.openedAt,
      closedAt: t.exit !== undefined ? new Date() : null, quantity: String(t.quantity),
      entryPrice: String(t.entry), exitPrice: t.exit?.toString(), stopPrice: t.stop?.toString(), targetPrice: t.target?.toString(),
      fees: String(t.fees ?? 0), pnl: net?.toString(), riskAmount: risk?.toString(), rMultiple: net !== undefined ? rMultiple(net, risk)?.toString() : undefined,
      followedPlan: followed, grade: t.grade ?? (net !== undefined ? suggestGrade(net, followed) : undefined),
      notes: t.notes || null, source: "manual",
    }).returning({ id: trade.id });

    if (findings.length) {
      await tx.insert(ruleViolation).values(findings.map((f) => ({ userId: user.id, ruleId: f.ruleId, tradeId: row.id, details: { title: f.title, overridden: f.overridden } })));
    }
    await clearDemo(tx, user.id); // first real data replaces the sample journal
    await tx.insert(auditLog).values({ userId: user.id, actor: "user", action: "trade.create", entity: "trade", entityId: row.id, meta: { violations: findings.length } });
    return { id: row.id };
  });

  if ("id" in result) redirect(`/journal?saved=${result.id}`);
  return result;
}

/** Soft delete; the Journal shows an Undo toast that calls restoreTrade. */
export async function deleteTrade(id: string) {
  const { user } = await requireSession();
  await withUser(user.id, async (tx) => {
    await tx.update(trade).set({ deletedAt: new Date() }).where(and(eq(trade.id, id), eq(trade.userId, user.id)));
    await tx.insert(auditLog).values({ userId: user.id, actor: "user", action: "trade.delete", entity: "trade", entityId: id });
  });
}

export async function restoreTrade(id: string) {
  const { user } = await requireSession();
  await withUser(user.id, (tx) => tx.update(trade).set({ deletedAt: null }).where(and(eq(trade.id, id), eq(trade.userId, user.id))));
}

export async function loadSampleJournal() {
  const { user } = await requireSession();
  await seedDemo(user.id);
  redirect("/dashboard");
}
