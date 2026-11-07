"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Check, ExternalLink, Link2, Loader2, Pencil, ShieldAlert, X } from "lucide-react";
import { updateTradeReview, addChartLink, removeAttachment, type ReviewResult } from "@/lib/actions/review";
import type { TradeDetail } from "@/lib/data/trade";
import { GRADE_LABEL, suggestGrade, type Grade } from "@/lib/trades/math";
import { EMOTIONS } from "@/lib/trades/emotions";
import { money } from "@/lib/format";
import { useToast } from "@/components/app/toast";

const GRADE_STYLE: Record<Grade, string> = {
  earned: "border-profit text-profit bg-profit-subtle", good_loss: "border-goodloss text-goodloss bg-goodloss-subtle",
  lucky: "border-lucky text-lucky bg-lucky-subtle", deserved: "border-loss text-loss bg-loss-subtle",
};
type Save = "idle" | "saving" | "saved" | "error";

export function TradeReview({ trade: initial }: { trade: TradeDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [t, setT] = useState(initial);
  const [save, setSave] = useState<Save>("idle");
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  const version = useRef(initial.version);
  const notesTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ccy = t.account.currency;

  /** Optimistic: update the screen now, save in the background, roll back on failure. */
  function patch(changes: Partial<Parameters<typeof updateTradeReview>[0]>, local: Partial<TradeDetail>) {
    const before = t;
    setT((x) => ({ ...x, ...local }));
    setSave("saving");
    start(async () => {
      const res: ReviewResult = await updateTradeReview({ id: t.id, version: version.current, ...changes });
      if (!res.ok) {
        setT(before);
        setSave("error");
        toast({ message: res.error, ...(res.conflict ? { action: { label: "Reload", run: () => router.refresh() } } : {}) });
        return;
      }
      version.current = res.version;
      setT((x) => ({ ...x, pnl: res.pnl, r: res.r, risk: res.risk }));
      setSave("saved");
    });
  }

  const suggested = t.pnl !== null && t.followedPlan !== null ? suggestGrade(t.pnl, t.followedPlan) : null;
  const opened = new Date(t.openedAt);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="flex flex-wrap items-end justify-between gap-6 rounded-xl border border-line bg-card p-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-[32px] font-bold tracking-[-0.03em]">{t.instrument.symbol}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.side === "long" ? "bg-profit-subtle text-profit" : "bg-loss-subtle text-loss"}`}>{t.side === "long" ? "Buy" : "Sell"}</span>
            {t.status === "open" ? <span className="rounded-full bg-citron-100 px-2.5 py-1 text-xs font-semibold text-citron-900">Open</span> : null}
          </div>
          <p className="text-sm text-fg-3">
            {t.instrument.name} · {t.instrument.exchange} · {t.account.name} · {opened.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex items-end gap-8">
          <Stat label="P&L" value={t.pnl === null ? "—" : money(t.pnl, ccy, { sign: true })} tone={t.pnl === null ? undefined : t.pnl >= 0 ? "profit" : "loss"} big />
          <Stat label="R" value={t.r === null ? "—" : `${t.r > 0 ? "+" : ""}${t.r}R`} />
          <Stat label="Risk" value={t.risk === null ? "—" : money(t.risk, ccy)} />
        </div>
      </section>

      {t.violations.length ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-loss bg-loss-subtle p-4 text-sm">
          <ShieldAlert size={18} className="mt-0.5 flex-none text-loss" aria-hidden />
          <p className="text-fg-2">
            <strong className="text-loss">Logged against your rules.</strong>{" "}
            {t.violations.map((v) => `${v.title}${v.overridden ? " (you overrode it)" : ""}`).join(" · ")}
          </p>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Execution */}
        <section aria-labelledby="exec-h" className="flex flex-col gap-6 rounded-xl border border-line bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 id="exec-h" className="text-[15px] font-semibold">Execution</h2>
            <button type="button" onClick={() => setEditing((e) => !e)} className="flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-fg-2 hover:bg-subtle">
              {editing ? <X size={14} aria-hidden /> : <Pencil size={14} aria-hidden />}{editing ? "Done" : "Edit"}
            </button>
          </div>

          <PriceLadder t={t} />

          {editing ? (
            <EditNumbers t={t} onSave={(c, local) => patch(c, local)} />
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Item k="Entry" v={fmt(t.entry)} /><Item k="Exit" v={t.exit === null ? "Still open" : fmt(t.exit)} />
              <Item k="Quantity" v={`${t.quantity}${t.instrument.contractSize !== 1 ? ` × ${t.instrument.contractSize.toLocaleString()}` : ""}`} />
              <Item k="Stop" v={t.stop === null ? "—" : fmt(t.stop)} /><Item k="Target" v={t.target === null ? "—" : fmt(t.target)} />
              <Item k="Fees" v={money(t.fees, ccy)} />
            </dl>
          )}

          <Charts t={t} onChange={() => router.refresh()} />
        </section>

        {/* Process */}
        <section aria-labelledby="proc-h" className="flex flex-col gap-6 rounded-xl border border-line bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 id="proc-h" className="text-[15px] font-semibold">Process</h2>
            <SaveState state={save} />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="plan" className="text-sm font-semibold">Plan</label>
            <select id="plan" value={t.strategy?.id ?? ""}
              onChange={(e) => {
                const s = t.strategies.find((x) => x.id === e.target.value);
                patch({ strategyId: s?.id ?? null }, { strategy: s ? { id: s.id, name: s.name, checklist: [] } : null, checklistMet: [] });
                router.refresh(); // pull the new plan's checklist
              }}
              className="h-12 rounded-md border border-line bg-card px-3 text-[15px] font-medium outline-none focus:border-citron-700">
              <option value="">No plan</option>
              {t.strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {t.strategy?.checklist.length ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">Checklist <span className="font-normal text-fg-3">{t.checklistMet.length} of {t.strategy.checklist.length}</span></legend>
              {t.strategy.checklist.map((c) => {
                const on = t.checklistMet.includes(c.id);
                return (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-subtle">
                    <input type="checkbox" checked={on} className="sr-only"
                      onChange={() => {
                        const next = on ? t.checklistMet.filter((x) => x !== c.id) : [...t.checklistMet, c.id];
                        patch({ checklistMet: next }, { checklistMet: next });
                      }} />
                    <motion.span aria-hidden animate={{ scale: on ? [1, 1.15, 1] : 1 }} transition={{ duration: 0.25 }}
                      className={`flex size-5 flex-none items-center justify-center rounded-md border ${on ? "border-profit bg-profit text-white" : "border-line-hover"}`}>
                      {on ? <Check size={13} strokeWidth={3} /> : null}
                    </motion.span>
                    <span className={`text-sm ${on ? "" : "text-fg-2"}`}>{c.label}</span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Followed your plan?</legend>
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((v) => (
                <button key={String(v)} type="button" aria-pressed={t.followedPlan === v}
                  onClick={() => patch({ followedPlan: v }, { followedPlan: v })}
                  className={`h-11 rounded-md border text-sm font-semibold transition-colors ${t.followedPlan === v ? "border-fg bg-fg text-page" : "border-line hover:border-line-hover"}`}>
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">
              Grade {suggested && t.grade !== suggested ? (
                <button type="button" onClick={() => patch({ grade: suggested }, { grade: suggested })} className="ml-1 font-normal text-fg-3 underline underline-offset-4">
                  suggested: {GRADE_LABEL[suggested]}
                </button>
              ) : null}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(GRADE_LABEL) as Grade[]).map((g) => (
                <button key={g} type="button" aria-pressed={t.grade === g} onClick={() => patch({ grade: g }, { grade: g })}
                  className={`h-11 rounded-md border text-sm font-semibold transition-colors ${t.grade === g ? GRADE_STYLE[g] : "border-line text-fg-2 hover:border-line-hover"}`}>
                  {GRADE_LABEL[g]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">How you felt</legend>
            <div className="flex flex-wrap gap-2">
              {EMOTIONS.map((e) => {
                const on = t.emotions.includes(e);
                return (
                  <button key={e} type="button" aria-pressed={on}
                    onClick={() => { const next = on ? t.emotions.filter((x) => x !== e) : [...t.emotions, e]; patch({ emotions: next as typeof EMOTIONS[number][] }, { emotions: next }); }}
                    className={`h-9 rounded-full border px-3.5 text-sm transition-colors ${on ? "border-fg bg-fg text-page" : "border-line text-fg-2 hover:border-line-hover"}`}>
                    {e}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <label htmlFor="notes" className="text-sm font-semibold">Notes</label>
            <textarea id="notes" rows={6} defaultValue={t.notes} placeholder="What you saw, why you entered, what you'd repeat or change"
              onChange={(e) => {
                const v = e.target.value;
                clearTimeout(notesTimer.current);
                setSave("saving");
                notesTimer.current = setTimeout(() => patch({ notes: v }, { notes: v }), 700); // autosave after typing pauses
              }}
              className="w-full resize-y rounded-md border border-line bg-card px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-citron-700 focus:shadow-[0_0_0_4px_rgba(228,227,58,0.35)]" />
          </div>
        </section>
      </div>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: "profit" | "loss"; big?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-xs text-fg-3">{label}</span>
      <span className={`num font-bold tracking-[-0.02em] ${big ? "text-[34px] leading-none" : "text-xl"} ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}>{value}</span>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (<div className="flex flex-col gap-0.5"><dt className="text-xs text-fg-3">{k}</dt><dd className="num font-semibold">{v}</dd></div>);
}

function SaveState({ state }: { state: Save }) {
  if (state === "idle") return null;
  return (
    <span aria-live="polite" className={`flex items-center gap-1.5 text-xs ${state === "error" ? "text-loss" : "text-fg-3"}`}>
      {state === "saving" ? <><Loader2 size={12} className="animate-spin" aria-hidden />Saving</> : state === "saved" ? <><Check size={12} aria-hidden />Saved</> : "Not saved"}
    </span>
  );
}

/** Stop, entry, exit and target drawn to scale, so you see at a glance how far price ran against the plan. */
function PriceLadder({ t }: { t: TradeDetail }) {
  const marks = [
    { k: "Stop", v: t.stop, c: "var(--loss-mark)" },
    { k: "Entry", v: t.entry, c: "var(--text-primary)" },
    { k: "Exit", v: t.exit, c: t.pnl !== null && t.pnl >= 0 ? "var(--profit-mark)" : "var(--loss-mark)" },
    { k: "Target", v: t.target, c: "var(--profit-mark)" },
  ].filter((m): m is { k: string; v: number; c: string } => m.v !== null);
  if (marks.length < 2) return null;
  const vals = marks.map((m) => m.v);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = (v: number) => 4 + ((v - lo) / span) * 92; // % across, with padding
  const exit = t.exit;
  return (
    <figure className="m-0" aria-label={`Price levels: ${marks.map((m) => `${m.k} ${fmt(m.v)}`).join(", ")}`}>
      <div className="relative h-[86px]">
        <div className="absolute inset-x-0 top-[40px] h-[3px] rounded bg-[var(--meter-track)]" />
        {exit !== null ? (
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-[40px] h-[3px] origin-left rounded"
            style={{ left: `${Math.min(x(t.entry), x(exit))}%`, width: `${Math.abs(x(exit) - x(t.entry))}%`, background: t.pnl !== null && t.pnl >= 0 ? "var(--profit-mark)" : "var(--loss-mark)", transformOrigin: exit >= t.entry ? "left" : "right" }} />
        ) : null}
        {marks.map((m, i) => (
          <div key={m.k} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${x(m.v)}%`, top: i % 2 ? 46 : 0 }}>
            {i % 2 ? <span className="mt-1 size-3 rounded-full border-2 border-card" style={{ background: m.c }} /> : null}
            <span className="whitespace-nowrap text-[11px] text-fg-3">{m.k}</span>
            <span className="num whitespace-nowrap text-xs font-semibold">{fmt(m.v)}</span>
            {i % 2 ? null : <span className="mt-1 size-3 rounded-full border-2 border-card" style={{ background: m.c }} />}
          </div>
        ))}
      </div>
    </figure>
  );
}

function EditNumbers({ t, onSave }: { t: TradeDetail; onSave: (c: Partial<Parameters<typeof updateTradeReview>[0]>, local: Partial<TradeDetail>) => void }) {
  const fields = [
    { k: "entry", label: "Entry", v: t.entry }, { k: "exit", label: "Exit", v: t.exit }, { k: "quantity", label: "Quantity", v: t.quantity },
    { k: "stop", label: "Stop", v: t.stop }, { k: "target", label: "Target", v: t.target }, { k: "fees", label: "Fees", v: t.fees },
  ] as const;
  return (
    <form className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const val = (k: string) => { const s = String(fd.get(k) ?? "").trim(); return s === "" ? null : Number(s); };
        const c = { entry: val("entry") ?? t.entry, exit: val("exit"), quantity: val("quantity") ?? t.quantity, stop: val("stop"), target: val("target"), fees: val("fees") ?? 0 };
        if ([c.entry, c.quantity].some((n) => !(n > 0))) return;
        onSave(c, { ...c, status: c.exit === null ? "open" : "closed" });
      }}>
      {fields.map((f) => (
        <label key={f.k} className="flex flex-col gap-1.5 text-xs text-fg-3">{f.label}
          <input name={f.k} inputMode="decimal" defaultValue={f.v ?? ""} placeholder={f.k === "exit" ? "Open" : "—"}
            className="num h-11 rounded-md border border-line bg-card px-3 text-[15px] font-semibold text-fg outline-none focus:border-citron-700" />
        </label>
      ))}
      <button type="submit" className="col-span-2 h-11 rounded-md bg-fg text-sm font-semibold text-page sm:col-span-3">Recalculate and save</button>
    </form>
  );
}

function Charts({ t, onChange }: { t: TradeDetail; onChange: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();
  const links = t.attachments.filter((a) => a.kind === "tradingview_link");
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-5">
      <h3 className="text-sm font-semibold">Chart</h3>
      {links.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2.5 text-sm">
          <Link2 size={15} className="flex-none text-fg-3" aria-hidden />
          <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex-1 truncate font-medium underline-offset-4 hover:underline">{a.url}</a>
          <ExternalLink size={14} className="text-fg-3" aria-hidden />
          <button type="button" aria-label="Remove chart link" onClick={() => start(async () => { await removeAttachment(a.id, t.id); onChange(); })}
            className="flex size-8 items-center justify-center rounded-md text-fg-3 hover:bg-card hover:text-loss"><X size={14} aria-hidden /></button>
        </div>
      ))}
      <form className="flex gap-2" onSubmit={(e) => {
        e.preventDefault(); setError(undefined);
        start(async () => { const r = await addChartLink(t.id, url); if ("error" in r) setError(r.error); else { setUrl(""); onChange(); } });
      }}>
        <label htmlFor="tv" className="sr-only">TradingView chart link</label>
        <input id="tv" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a TradingView chart link"
          className="h-11 flex-1 rounded-md border border-line bg-card px-3 text-sm outline-none focus:border-citron-700" />
        <button type="submit" disabled={!url || busy} className="h-11 rounded-md border border-line px-4 text-sm font-semibold disabled:opacity-50">Attach</button>
      </form>
      {error ? <p role="alert" className="text-[13px] text-loss">{error}</p> : null}
    </div>
  );
}
