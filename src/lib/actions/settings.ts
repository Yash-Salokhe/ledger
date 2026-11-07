"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { auditLog, profile, ruleOverride, tradingAccount, tradingRule } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";
import { localNow } from "@/lib/data/gate";

export type SettingsState = { ok?: boolean; error?: string } | undefined;
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().finite().nonnegative().optional());
const isTz = (tz: string) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };

const ProfileInput = z.object({
  baseCurrency: z.string().length(3),
  timezone: z.string().refine(isTz, "Unknown timezone"),
  defaultRiskPct: z.coerce.number().min(0.01).max(100),
});

export async function saveProfile(_: SettingsState, form: FormData): Promise<SettingsState> {
  const { user } = await requireSession();
  const p = ProfileInput.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Check the currency, timezone and risk %." };
  await withUser(user.id, (tx) => tx.update(profile).set({
    baseCurrency: p.data.baseCurrency.toUpperCase(), timezone: p.data.timezone, defaultRiskPct: String(p.data.defaultRiskPct),
  }).where(eq(profile.userId, user.id)));
  revalidatePath("/", "layout");
  return { ok: true };
}

const AccountInput = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), z.guid().optional()),
  name: z.string().trim().min(1).max(80),
  broker: z.string().trim().max(80).optional(),
  kind: z.enum(["live", "demo", "prop_evaluation", "paper"]),
  currency: z.string().length(3),
  openingBalance: z.coerce.number().finite().nonnegative(),
});

export async function saveAccount(_: SettingsState, form: FormData): Promise<SettingsState> {
  const { user } = await requireSession();
  const a = AccountInput.safeParse(Object.fromEntries(form));
  if (!a.success) return { error: "Give the account a name, currency and starting balance." };
  const values = { name: a.data.name, broker: a.data.broker || null, kind: a.data.kind, currency: a.data.currency.toUpperCase(), openingBalance: String(a.data.openingBalance) };
  await withUser(user.id, async (tx) => {
    if (a.data.id) await tx.update(tradingAccount).set(values).where(and(eq(tradingAccount.id, a.data.id), eq(tradingAccount.userId, user.id)));
    else await tx.insert(tradingAccount).values({ ...values, userId: user.id });
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function archiveAccount(id: string) {
  const { user } = await requireSession();
  await withUser(user.id, (tx) => tx.update(tradingAccount).set({ archivedAt: new Date() }).where(and(eq(tradingAccount.id, id), eq(tradingAccount.userId, user.id))));
  revalidatePath("/", "layout");
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const RulesInput = z.object({
  enforcement: z.enum(["block", "warn"]),
  maxTrades: optNum,
  maxDailyLoss: optNum,
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  maxRiskPct: optNum,
});

/** Rules are global (all accounts) in v1; one row per kind. An empty field turns that rule off. */
export async function saveRules(_: SettingsState, form: FormData): Promise<SettingsState> {
  const { user } = await requireSession();
  const r = RulesInput.safeParse(Object.fromEntries(form));
  if (!r.success) return { error: "Check the numbers in your rules." };
  const { enforcement, maxTrades, maxDailyLoss, windowStart, windowEnd, maxRiskPct } = r.data;
  if ((windowStart || windowEnd) && !(windowStart && windowEnd && HHMM.test(windowStart) && HHMM.test(windowEnd)))
    return { error: "Set both a start and an end time for your trading window." };

  const desired = [
    { kind: "max_trades_per_day" as const, on: Boolean(maxTrades), config: { max: Math.floor(maxTrades ?? 0) } },
    { kind: "max_daily_loss" as const, on: Boolean(maxDailyLoss), config: { amount: maxDailyLoss ?? 0 } },
    { kind: "trading_window" as const, on: Boolean(windowStart && windowEnd), config: { start: windowStart, end: windowEnd } },
    { kind: "max_risk_per_trade" as const, on: Boolean(maxRiskPct), config: { pct: maxRiskPct ?? 0 } },
  ];

  await withUser(user.id, async (tx) => {
    const existing = await tx.select().from(tradingRule).where(and(eq(tradingRule.userId, user.id), isNull(tradingRule.accountId)));
    for (const d of desired) {
      const row = existing.find((e) => e.kind === d.kind);
      if (row) await tx.update(tradingRule).set({ enabled: d.on, config: d.on ? d.config : row.config, enforcement }).where(eq(tradingRule.id, row.id));
      else if (d.on) await tx.insert(tradingRule).values({ userId: user.id, kind: d.kind, config: d.config, enforcement });
    }
    await tx.insert(auditLog).values({ userId: user.id, actor: "user", action: "rules.update", meta: { enforcement } });
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Unlock one rule for the rest of today. Recorded permanently; shows up in Weekly review. */
export async function overrideRuleToday(ruleId: string, reason: string) {
  const { user } = await requireSession();
  await withUser(user.id, async (tx) => {
    const [p] = await tx.select({ tz: profile.timezone }).from(profile).where(eq(profile.userId, user.id));
    const { day } = localNow(p?.tz ?? "UTC");
    await tx.insert(ruleOverride).values({ userId: user.id, ruleId, day, reason: reason.slice(0, 500) || null }).onConflictDoNothing();
    await tx.insert(auditLog).values({ userId: user.id, actor: "user", action: "rule.override", entity: "trading_rule", entityId: ruleId, meta: { day } });
  });
  revalidatePath("/", "layout");
}

export async function cancelOverrideToday(ruleId: string) {
  const { user } = await requireSession();
  await withUser(user.id, async (tx) => {
    const [p] = await tx.select({ tz: profile.timezone }).from(profile).where(eq(profile.userId, user.id));
    const { day } = localNow(p?.tz ?? "UTC");
    await tx.delete(ruleOverride).where(and(eq(ruleOverride.ruleId, ruleId), eq(ruleOverride.day, day), eq(ruleOverride.userId, user.id)));
  });
  revalidatePath("/", "layout");
}
