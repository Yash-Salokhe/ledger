"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Lock, ShieldAlert } from "lucide-react";
import { createTrade, type TradeFormState } from "@/lib/actions/trades";
import type { TradeFormData } from "@/lib/data/trade-form";
import { pnl, riskAmount, rMultiple, suggestGrade, GRADE_LABEL, type Grade, type Side } from "@/lib/trades/math";
import { money } from "@/lib/format";

const GRADE_STYLE: Record<Grade, string> = {
  earned: "border-profit text-profit bg-profit-subtle",
  good_loss: "border-goodloss text-goodloss bg-goodloss-subtle",
  lucky: "border-lucky text-lucky bg-lucky-subtle",
  deserved: "border-loss text-loss bg-loss-subtle",
};
const UNIT: Record<string, string> = { forex: "Lots", commodity: "Lots", future: "Contracts", option: "Lots", index: "Lots", cfd: "Units", equity: "Shares", crypto: "Coins", bond: "Units" };
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "AED"];

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const n = (v: string) => (v.trim() === "" ? undefined : Number(v));

export function TradeForm({ data, gate }: { data: TradeFormData; gate: { canTrade: boolean; lockReason?: string } }) {
  const [state, action, pending] = useActionState<TradeFormState, FormData>(createTrade, undefined);
  const hasAccount = data.accounts.length > 0;

  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const [currency, setCurrency] = useState("INR");
  const [instrumentId, setInstrumentId] = useState(data.instruments[0]?.id ?? "");
  const [side, setSide] = useState<Side>("long");
  const [qty, setQty] = useState("1");
  const [entry, setEntry] = useState("");
  const [exit, setExit] = useState("");
  const [stop, setStop] = useState("");
  const [fees, setFees] = useState("");
  const [followed, setFollowed] = useState<boolean | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [openedAt, setOpenedAt] = useState(nowLocal);

  const account = data.accounts.find((a) => a.id === accountId);
  const ins = data.instruments.find((i) => i.id === instrumentId);
  const ccy = account?.currency ?? currency;

  const preview = useMemo(() => {
    const q = n(qty), e = n(entry), x = n(exit), s = n(stop);
    if (!ins || !q || !e) return null;
    const net = x !== undefined ? pnl({ side, quantity: q, entry: e, exit: x, contractSize: ins.contractSize, fees: n(fees) }) : undefined;
    const risk = riskAmount({ side, quantity: q, entry: e, stop: s, contractSize: ins.contractSize });
    const riskPct = risk && account?.balance ? (risk / account.balance) * 100 : undefined;
    return { net, risk, r: net !== undefined ? rMultiple(net, risk) : undefined, riskPct };
  }, [qty, entry, exit, stop, fees, side, ins, account]);

  const suggested = preview?.net !== undefined && followed !== null ? suggestGrade(preview.net, followed) : null;
  const shownGrade = grade ?? suggested;
  const err = state?.fieldErrors ?? {};

  const groups = useMemo(() => {
    const g = new Map<string, TradeFormData["instruments"]>();
    for (const i of data.instruments) g.set(i.exchange, [...(g.get(i.exchange) ?? []), i]);
    return [...g];
  }, [data.instruments]);

  const isToday = openedAt.slice(0, 10) === nowLocal().slice(0, 10);
  const lockedNow = !gate.canTrade && isToday;

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      {!gate.canTrade ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-loss bg-loss-subtle p-4 lg:col-span-2">
          <Lock size={18} className="mt-0.5 flex-none text-loss" aria-hidden />
          <p className="text-sm text-fg-2">
            <strong className="text-loss">{gate.lockReason}.</strong> New trades for today are locked by your own rule. You can still log trades from earlier days.{" "}
            <Link href="/settings#rules" className="font-semibold underline underline-offset-4">Rules in Settings</Link>
          </p>
        </div>
      ) : null}
      <input type="hidden" name="openedAt" value={openedAt ? new Date(openedAt).toISOString() : ""} />
      <input type="hidden" name="side" value={side} />
      <input type="hidden" name="followedPlan" value={followed === null ? "" : followed ? "yes" : "no"} />
      <input type="hidden" name="grade" value={grade ?? ""} />

      <section className="flex flex-col gap-5 rounded-xl border border-line bg-card p-6" aria-labelledby="trade-h">
        <h2 id="trade-h" className="text-[15px] font-semibold">Trade</h2>

        {hasAccount ? (
          <Select label="Account" name="accountId" value={accountId} onChange={setAccountId}>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </Select>
        ) : (
          <div className="grid gap-3 rounded-lg bg-subtle p-4 sm:grid-cols-[1.4fr_0.8fr_1fr]">
            <p className="text-sm font-semibold sm:col-span-3">Your first trading account</p>
            <Input label="Name" name="newAccountName" placeholder="Zerodha, FTMO challenge…" error={err.newAccountName} required />
            <Select label="Currency" name="newAccountCurrency" value={currency} onChange={setCurrency}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Input label="Starting balance" name="newAccountBalance" inputMode="decimal" placeholder="0" />
          </div>
        )}

        <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 rounded-[14px] bg-subtle p-1">
          {(["long", "short"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => setSide(s)}
              className="relative h-10 rounded-[10px] text-sm font-semibold">
              {side === s ? <motion.span layoutId="side-pill" className="absolute inset-0 rounded-[10px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
              <span className="relative">{s === "long" ? "Buy" : "Sell"}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Market" name="instrumentId" value={instrumentId} onChange={setInstrumentId}>
            {groups.map(([ex, items]) => (
              <optgroup key={ex} label={ex}>
                {items.map((i) => <option key={i.id} value={i.id}>{i.symbol} · {i.name}</option>)}
              </optgroup>
            ))}
          </Select>
          <Input label="Opened" type="datetime-local" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} required />
          <Input label={UNIT[ins?.assetClass ?? "equity"]} name="quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} error={err.quantity} required
            hint={ins && ins.contractSize !== 1 ? `1 = ${ins.contractSize.toLocaleString()} units` : undefined} />
          <Input label="Fees" name="fees" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0" />
          <Input label="Entry" name="entry" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} error={err.entry} required />
          <Input label="Exit" name="exit" inputMode="decimal" value={exit} onChange={(e) => setExit(e.target.value)} hint="Leave empty if still open" />
          <Input label="Stop" name="stop" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} hint="Used for risk and R" />
          <Input label="Target" name="target" inputMode="decimal" />
        </div>
      </section>

      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-5 rounded-xl border border-line bg-card p-6" aria-labelledby="process-h">
          <h2 id="process-h" className="text-[15px] font-semibold">Process</h2>

          {data.strategies.length ? (
            <Select label="Plan" name="strategyId" value={undefined} onChange={() => {}}>
              <option value="">No plan</option>
              {data.strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Followed your plan?</legend>
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((v) => (
                <button key={String(v)} type="button" aria-pressed={followed === v} onClick={() => { setFollowed(v); setGrade(null); }}
                  className={`h-11 rounded-md border text-sm font-semibold transition-colors ${followed === v ? "border-fg bg-fg text-page" : "border-line bg-card hover:border-line-hover"}`}>
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
            {err.followedPlan ? <p role="alert" className="text-[13px] text-loss">Choose yes or no. It decides the grade.</p> : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Grade {suggested && !grade ? <span className="font-normal text-fg-3">· suggested</span> : null}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(GRADE_LABEL) as Grade[]).map((g) => (
                <button key={g} type="button" aria-pressed={shownGrade === g} onClick={() => setGrade(g)}
                  className={`h-11 rounded-md border text-sm font-semibold transition-colors ${shownGrade === g ? GRADE_STYLE[g] : "border-line bg-card text-fg-2 hover:border-line-hover"}`}>
                  {GRADE_LABEL[g]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <label htmlFor="notes" className="text-sm font-semibold">Notes</label>
            <textarea id="notes" name="notes" rows={4} placeholder="Why you took it, how you felt, what you'd repeat"
              className="w-full resize-y rounded-md border border-line bg-card px-3.5 py-3 text-[15px] outline-none focus:border-citron-700 focus:shadow-[0_0_0_4px_rgba(228,227,58,0.35)]" />
          </div>
        </section>

        <section aria-live="polite" className="flex flex-col gap-3 rounded-xl bg-subtle p-6">
          <Row label="P&L" value={preview?.net !== undefined ? money(preview.net, ccy, { sign: true }) : "—"} tone={preview?.net === undefined ? undefined : preview.net >= 0 ? "profit" : "loss"} />
          <Row label="R multiple" value={preview?.r !== undefined ? `${preview.r > 0 ? "+" : ""}${preview.r}R` : "—"} />
          <Row label="Risk" value={preview?.risk !== undefined ? `${money(preview.risk, ccy)}${preview.riskPct !== undefined ? ` · ${preview.riskPct.toFixed(2)}%` : ""}` : "Add a stop"} />

          <AnimatePresence>
            {state?.needsAck ? (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-3 rounded-lg border border-loss bg-loss-subtle p-4">
                <p className="flex gap-2 text-sm text-loss"><ShieldAlert size={18} className="flex-none" aria-hidden />{state.needsAck}</p>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="acknowledgeOverride" className="size-4 accent-[var(--loss-text)]" required />
                  I know I&rsquo;m breaking my own rule
                </label>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {state?.error ? <p role="alert" className="text-sm text-loss">{state.error}</p> : null}

          <button type="submit" disabled={pending || followed === null || lockedNow}
            className={`mt-1 flex h-12 items-center justify-center gap-2 rounded-md text-[15px] font-semibold transition-[filter] disabled:cursor-not-allowed disabled:opacity-50 ${state?.needsAck ? "bg-loss text-white" : "bg-citron text-[#141413] hover:brightness-[0.97]"}`}>
            {pending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
            {state?.needsAck ? "Log it anyway" : "Log trade"}
          </button>
          {lockedNow ? <p className="text-center text-xs text-loss">Change the date to log an earlier trade.</p>
            : followed === null ? <p className="text-center text-xs text-fg-3">Answer &ldquo;Followed your plan?&rdquo; to log the trade.</p> : null}
        </section>
      </div>
    </form>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "profit" | "loss" }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-fg-3">{label}</span>
      <span className={`num text-lg font-bold ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}>{value}</span>
    </div>
  );
}

function Input({ label, error, hint, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = `f-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <input id={id} {...p} aria-invalid={Boolean(error)}
        className={`num h-12 w-full rounded-md border bg-card px-3.5 text-[15px] font-medium outline-none focus:border-citron-700 focus:shadow-[0_0_0_4px_rgba(228,227,58,0.35)] ${error ? "border-loss" : "border-line"}`} />
      {error ? <p role="alert" className="text-[13px] text-loss">{error}</p> : hint ? <p className="text-xs text-fg-3">{hint}</p> : null}
    </div>
  );
}

function Select({ label, name, value, onChange, children }: { label: string; name: string; value?: string; onChange: (v: string) => void; children: React.ReactNode }) {
  const id = `s-${name}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <select id={id} name={name} {...(value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) } : {})}
        className="h-12 w-full rounded-md border border-line bg-card px-3 text-[15px] font-medium outline-none focus:border-citron-700 focus:shadow-[0_0_0_4px_rgba(228,227,58,0.35)]">
        {children}
      </select>
    </div>
  );
}
