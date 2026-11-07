"use client";
import { cloneElement, useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Download, FileUp, Loader2, ShieldAlert, Unlock } from "lucide-react";
import {
  saveProfile, saveAccount, saveRules, archiveAccount, overrideRuleToday, cancelOverrideToday, type SettingsState,
} from "@/lib/actions/settings";
import type { SettingsData } from "@/lib/data/settings";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/components/app/toast";
import { money } from "@/lib/format";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "AED", "CHF"];
const ZONES = ["Asia/Kolkata", "America/Phoenix", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC"];
const RULE_LABEL: Record<string, string> = {
  max_trades_per_day: "Max trades per day", max_daily_loss: "Max daily loss", trading_window: "Trading window", max_risk_per_trade: "Max risk per trade",
};

/* ── shared bits ─────────────────────────────────────────── */

function Card({ title, id, children, description }: { title: string; id?: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id ?? title}-h`} className="flex scroll-mt-6 flex-col gap-5 rounded-xl border border-line bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 id={`${id ?? title}-h`} className="text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
        {description ? <p className="text-sm text-fg-3">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const inputCls = "num h-12 w-full rounded-md border border-line bg-subtle px-3.5 text-[15px] font-medium outline-none focus:border-citron-700 focus:bg-card focus:shadow-[0_0_0_4px_rgba(228,227,58,0.35)]";

function Field({ label, children, hint }: { label: string; children: React.ReactElement<{ id?: string }>; hint?: string }) {
  const id = `set-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {cloneElement(children, { id })}
      {hint ? <p className="text-xs text-fg-3">{hint}</p> : null}
    </div>
  );
}

function Save({ pending, label = "Save changes" }: { pending: boolean; label?: string }) {
  return (
    <button type="submit" disabled={pending} className="flex h-11 items-center gap-2 self-start rounded-md bg-fg px-4 text-sm font-semibold text-page disabled:opacity-60">
      {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}{label}
    </button>
  );
}

/** Shows the "Saved" toast once per successful action result. */
function useSavedToast(state: SettingsState, message = "Saved") {
  const toast = useToast();
  useEffect(() => { if (state?.ok) toast({ message }); }, [state, toast, message]);
}

/* ── Account ─────────────────────────────────────────────── */

export function ProfileForm({ profile, email, name }: { profile: SettingsData["profile"]; email: string; name: string }) {
  const [state, action, pending] = useActionState(saveProfile, undefined);
  useSavedToast(state);
  return (
    <Card title="Account">
      <form action={action} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className={inputCls} value={name} readOnly /></Field>
          <Field label="Email"><input className={inputCls} value={email} readOnly /></Field>
          <Field label="Base currency" hint="Totals across accounts are shown in this currency.">
            <select name="baseCurrency" defaultValue={profile.baseCurrency} className={inputCls}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Timezone" hint="Decides where your trading day starts and ends.">
            <select name="timezone" defaultValue={profile.timezone} className={inputCls}>
              {[...new Set([profile.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}
            </select>
          </Field>
          <Field label="Default risk per trade (%)"><input name="defaultRiskPct" inputMode="decimal" defaultValue={profile.defaultRiskPct} className={inputCls} /></Field>
        </div>
        {state?.error ? <p role="alert" className="text-sm text-loss">{state.error}</p> : null}
        <Save pending={pending} />
      </form>
    </Card>
  );
}

/* ── Trading accounts ───────────────────────────────────── */

export function AccountsSection({ accounts }: { accounts: SettingsData["accounts"] }) {
  const [editing, setEditing] = useState<string | "new" | null>(accounts.length ? null : "new");
  const [state, action, pending] = useActionState(async (prev: SettingsState, fd: FormData) => {
    const res = await saveAccount(prev, fd);
    if (res?.ok) setEditing(null); // close the editor after a successful save
    return res;
  }, undefined);
  const [, start] = useTransition();
  const router = useRouter();
  useSavedToast(state, "Account saved");
  const current = accounts.find((a) => a.id === editing);

  return (
    <Card title="Trading accounts" description="Live, demo, prop evaluation or paper. Each keeps its own currency and balance.">
      <ul className="flex flex-col divide-y divide-line-subtle">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-3">
            <span className="flex-1">
              <span className="font-semibold">{a.name}</span>
              <span className="ml-2 text-sm text-fg-3">{a.kind.replace("_", " ")} · {money(a.openingBalance, a.currency, { decimals: 0 })} start</span>
            </span>
            <button type="button" onClick={() => setEditing(a.id)} className="h-9 rounded-md px-3 text-sm font-semibold hover:bg-subtle">Edit</button>
            <button type="button" onClick={() => start(async () => { await archiveAccount(a.id); router.refresh(); })} className="h-9 rounded-md px-3 text-sm text-fg-3 hover:bg-subtle">Archive</button>
          </li>
        ))}
      </ul>
      {editing ? (
        <form key={editing} action={action} className="flex flex-col gap-4 rounded-lg bg-subtle p-4">
          <input type="hidden" name="id" value={current?.id ?? ""} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account name"><input name="name" required defaultValue={current?.name} placeholder="Zerodha, FTMO 100k…" className={inputCls.replace("bg-subtle", "bg-card")} /></Field>
            <Field label="Broker"><input name="broker" defaultValue={current?.broker ?? ""} className={inputCls.replace("bg-subtle", "bg-card")} /></Field>
            <Field label="Type">
              <select name="kind" defaultValue={current?.kind ?? "live"} className={inputCls.replace("bg-subtle", "bg-card")}>
                <option value="live">Live</option><option value="prop_evaluation">Prop evaluation</option><option value="demo">Demo</option><option value="paper">Paper</option>
              </select>
            </Field>
            <Field label="Currency"><select name="currency" defaultValue={current?.currency ?? "INR"} className={inputCls.replace("bg-subtle", "bg-card")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Starting balance" hint="Your balance chart and returns are measured from this."><input name="openingBalance" inputMode="decimal" required defaultValue={current?.openingBalance ?? ""} className={inputCls.replace("bg-subtle", "bg-card")} /></Field>
          </div>
          {state?.error ? <p role="alert" className="text-sm text-loss">{state.error}</p> : null}
          <div className="flex gap-2">
            <Save pending={pending} label={current ? "Save account" : "Add account"} />
            {accounts.length ? <button type="button" onClick={() => setEditing(null)} className="h-11 rounded-md px-4 text-sm font-semibold">Cancel</button> : null}
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="self-start text-sm font-semibold underline underline-offset-4">Add an account</button>
      )}
    </Card>
  );
}

/* ── Rules & limits ─────────────────────────────────────── */

export function RulesForm({ rules, tradesToday }: { rules: SettingsData["rules"]; tradesToday: number }) {
  const [state, action, pending] = useActionState(saveRules, undefined);
  const [confirm, setConfirm] = useState<SettingsData["rules"]["list"][number] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  useSavedToast(state, "Rules saved");

  return (
    <Card title="Rules & limits" id="rules" description="Rules you set for yourself. Ledger holds you to them.">
      <form action={action} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max trades per day" hint={`${tradesToday} taken today`}><input name="maxTrades" inputMode="numeric" defaultValue={rules.maxTrades ?? ""} placeholder="Off" className={inputCls} /></Field>
          <Field label="Max daily loss"><input name="maxDailyLoss" inputMode="decimal" defaultValue={rules.maxDailyLoss ?? ""} placeholder="Off" className={inputCls} /></Field>
          <Field label="Trading window starts"><input name="windowStart" type="time" defaultValue={rules.windowStart ?? ""} className={inputCls} /></Field>
          <Field label="Trading window ends"><input name="windowEnd" type="time" defaultValue={rules.windowEnd ?? ""} className={inputCls} /></Field>
          <Field label="Max risk per trade (%)"><input name="maxRiskPct" inputMode="decimal" defaultValue={rules.maxRiskPct ?? ""} placeholder="Off" className={inputCls} /></Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">When I hit a rule</legend>
          {[
            { v: "block", label: "Lock New trade", sub: "Grey out the button until tomorrow. I can override in Settings." },
            { v: "warn", label: "Only flag it", sub: "Let me trade, mark the trade and show it in Weekly review." },
          ].map((o) => (
            <label key={o.v} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-fg">
              <input type="radio" name="enforcement" value={o.v} defaultChecked={rules.enforcement === o.v} className="mt-1 accent-[#141413]" />
              <span><span className="text-sm font-semibold">{o.label}</span><span className="block text-[13px] text-fg-3">{o.sub}</span></span>
            </label>
          ))}
        </fieldset>
        {state?.error ? <p role="alert" className="text-sm text-loss">{state.error}</p> : null}
        <Save pending={pending} label="Save rules" />
      </form>

      {rules.list.length ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Today</h3>
          {rules.list.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{RULE_LABEL[r.kind]}</span>
              {r.overriddenToday ? (
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-loss-subtle px-2.5 py-1 text-xs font-semibold text-loss">Overridden today</span>
                  <button type="button" disabled={busy} onClick={() => start(async () => { await cancelOverrideToday(r.id); router.refresh(); toast({ message: "Rule back on" }); })}
                    className="text-xs font-semibold underline underline-offset-4">Turn back on</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirm(r)} className="flex h-9 items-center gap-1.5 rounded-md px-3 font-semibold text-fg-2 hover:bg-subtle">
                  <Unlock size={14} aria-hidden /> Override for today
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <AnimatePresence>
        {confirm ? (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(null)} />
            <motion.div role="alertdialog" aria-modal="true" aria-labelledby="ovr-h" aria-describedby="ovr-b"
              initial={{ y: 12, scale: 0.97 }} animate={{ y: 0, scale: 1, transition: { type: "spring", stiffness: 450, damping: 32 } }}
              className="relative flex w-full max-w-[440px] flex-col gap-4 rounded-xl border border-line bg-card p-6">
              <span className="flex size-11 items-center justify-center rounded-lg bg-loss-subtle text-loss"><ShieldAlert size={22} aria-hidden /></span>
              <h2 id="ovr-h" className="text-xl font-bold tracking-[-0.02em]">You&rsquo;re about to break your own rule</h2>
              <p id="ovr-b" className="text-[15px] leading-relaxed text-fg-2">
                {confirm.kind === "max_trades_per_day"
                  ? `You've already taken the trades you allowed yourself today. Unlocking means any new trade breaks your ${(confirm.config as { max: number }).max}-trade limit.`
                  : `Unlocking turns off "${RULE_LABEL[confirm.kind]}" until tomorrow.`}{" "}
                Every trade logged after this is flagged and shows up in your weekly review.
              </p>
              <div className="flex flex-col gap-2">
                <label htmlFor="ovr-reason" className="text-sm font-semibold">Why now? <span className="font-normal text-fg-3">(for your review)</span></label>
                <textarea id="ovr-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-md border border-line bg-card p-3 text-sm outline-none focus:border-citron-700" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" autoFocus onClick={() => setConfirm(null)} className="h-11 rounded-md bg-fg px-4 text-sm font-semibold text-page">Keep my rule</button>
                <button type="button" disabled={busy} onClick={() => start(async () => { await overrideRuleToday(confirm.id, reason); setConfirm(null); setReason(""); router.refresh(); toast({ message: "Rule overridden for today" }); })}
                  className="h-11 rounded-md border border-loss px-4 text-sm font-semibold text-loss">Override for today</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
  );
}

/* ── Data ───────────────────────────────────────────────── */

export function DataSection() {
  return (
    <Card title="Data" description="Your journal lives in Ledger's database. Take a full copy any time.">
      <div className="grid gap-2 sm:grid-cols-3">
        <Link href="/import" className="flex h-11 items-center justify-center gap-2 rounded-md border border-line text-sm font-semibold hover:border-line-hover"><FileUp size={16} aria-hidden />Import trades</Link>
        <a href="/api/export?format=csv" className="flex h-11 items-center justify-center gap-2 rounded-md border border-line text-sm font-semibold hover:border-line-hover"><Download size={16} aria-hidden />Export CSV</a>
        <a href="/api/export?format=json" className="flex h-11 items-center justify-center gap-2 rounded-md border border-line text-sm font-semibold hover:border-line-hover"><Download size={16} aria-hidden />Full backup (JSON)</a>
      </div>
    </Card>
  );
}

export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function remove() {
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.deleteUser(password ? { password } : {});
    setBusy(false);
    if (error) return setError(error.status === 400 || error.status === 401 ? "Enter your password, or sign in again and retry." : "We couldn't delete your account. Try again.");
    router.push("/sign-in");
  }

  return (
    <Card title="Delete account" description="Permanently deletes your account, journal, rules and screenshots. This can't be undone. Export a backup first.">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="h-11 self-start rounded-md border border-loss px-4 text-sm font-semibold text-loss">Delete my account</button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-loss p-4">
          <label className="flex flex-col gap-2 text-sm font-semibold">Type DELETE to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className={inputCls} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">Password <span className="font-normal text-fg-3">(leave empty if you sign in with Google, Apple or a passkey)</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete="current-password" />
          </label>
          {error ? <p role="alert" className="text-sm text-loss">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" disabled={typed !== "DELETE" || busy} onClick={remove} className="flex h-11 items-center gap-2 rounded-md bg-loss px-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}Delete permanently
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-md px-4 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}
