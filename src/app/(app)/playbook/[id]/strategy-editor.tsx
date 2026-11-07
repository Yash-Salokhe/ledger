"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Reorder, useDragControls } from "motion/react";
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { saveStrategy, archiveStrategy } from "@/lib/actions/playbook";
import type { StrategyDetail } from "@/lib/data/playbook";
import { GRADE_LABEL } from "@/lib/trades/math";
import { money } from "@/lib/format";
import { useToast } from "@/components/app/toast";

type Step = { id: string; label: string };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "step";

export function StrategyEditor({ strategy: s }: { strategy: StrategyDetail }) {
  const toast = useToast();
  const [name, setName] = useState(s.name);
  const [description, setDescription] = useState(s.description);
  const [steps, setSteps] = useState<Step[]>(s.checklist.map(({ id, label }) => ({ id, label })));
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const dirty = name !== s.name || description !== s.description || JSON.stringify(steps) !== JSON.stringify(s.checklist.map(({ id, label }) => ({ id, label })));

  const addStep = () => {
    const label = draft.trim();
    if (!label) return;
    let id = slug(label), i = 2;
    while (steps.some((x) => x.id === id)) id = `${slug(label)}-${i++}`;
    setSteps([...steps, { id, label }]);
    setDraft("");
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  const stats = s.stats;
  const insight = s.checklist
    .filter((c) => c.metN >= 3 && c.skipN >= 3 && c.metR !== null && c.skipR !== null)
    .sort((a, b) => (b.metR! - b.skipR!) - (a.metR! - a.skipR!))[0];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_1fr]">
      <section aria-label="Strategy" className="flex flex-col gap-5 rounded-xl border border-line bg-card p-6">
        <label htmlFor="sn" className="sr-only">Name</label>
        <input id="sn" value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
          className="-mx-2 rounded-md px-2 py-1 text-[30px] font-bold tracking-[-0.03em] outline-none hover:bg-subtle focus:bg-subtle" />
        <div className="flex flex-col gap-2">
          <label htmlFor="sd" className="text-sm font-semibold">When you take it</label>
          <textarea id="sd" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000}
            placeholder="The market condition and trigger, in a sentence or two."
            className="rounded-md border border-line bg-card px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-citron-700" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Checklist <span className="font-normal text-fg-3">· drag or use the arrows to reorder</span></h2>
          <Reorder.Group axis="y" values={steps} onReorder={setSteps} className="flex flex-col gap-2">
            {steps.map((st, i) => (
              <StepRow key={st.id} step={st} index={i} count={steps.length}
                onLabel={(label) => setSteps(steps.map((x) => (x.id === st.id ? { ...x, label } : x)))}
                onRemove={() => setSteps(steps.filter((x) => x.id !== st.id))}
                onMove={(d) => move(i, d)} />
            ))}
          </Reorder.Group>
          <form onSubmit={(e) => { e.preventDefault(); addStep(); }} className="flex gap-2">
            <label htmlFor="ns" className="sr-only">New step</label>
            <input id="ns" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a step, e.g. Waited for the candle close" maxLength={140}
              className="h-11 flex-1 rounded-md border border-dashed border-line-hover bg-card px-3 text-sm outline-none focus:border-citron-700 focus:border-solid" />
            <button type="submit" disabled={!draft.trim()} className="flex h-11 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-semibold disabled:opacity-50"><Plus size={14} aria-hidden />Add</button>
          </form>
        </div>

        {error ? <p role="alert" className="text-sm text-loss">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <button type="button" disabled={!dirty || pending}
            onClick={() => start(async () => { setError(undefined); const r = await saveStrategy(s.id, { name, description, checklist: steps }); if ("error" in r) setError(r.error); else toast({ message: "Strategy saved" }); })}
            className="flex h-11 items-center gap-2 rounded-md bg-fg px-4 text-sm font-semibold text-page disabled:opacity-40">
            {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}Save strategy
          </button>
          <form action={archiveStrategy.bind(null, s.id)}>
            <button type="submit" className="h-11 rounded-md px-3 text-sm font-semibold text-fg-3 hover:text-loss">Archive</button>
          </form>
        </div>
      </section>

      <div className="flex flex-col gap-5">
        <section aria-labelledby="perf-h" className="flex flex-col gap-4 rounded-xl border border-line bg-card p-6">
          <h2 id="perf-h" className="text-[15px] font-semibold">How it performs</h2>
          <dl className="grid grid-cols-2 gap-3">
            <Tile k="Trades" v={String(stats.trades)} />
            <Tile k="Win rate" v={stats.winRate === null ? "—" : `${stats.winRate.toFixed(0)}%`} />
            <Tile k="Average R" v={stats.avgR === null ? "—" : `${stats.avgR > 0 ? "+" : ""}${stats.avgR}R`} tone={stats.avgR === null ? undefined : stats.avgR >= 0 ? "profit" : "loss"} />
            <Tile k="Followed plan" v={stats.adherence === null ? "—" : `${stats.adherence.toFixed(0)}%`} />
          </dl>
          {insight ? (
            <p className="rounded-lg bg-citron-50 p-3 text-sm leading-relaxed text-citron-900">
              <strong>{insight.label}</strong> matters most: {insight.metR! >= 0 ? "+" : ""}{insight.metR}R on average when you do it, {insight.skipR! >= 0 ? "+" : ""}{insight.skipR}R when you skip it.
            </p>
          ) : null}
        </section>

        {s.checklist.some((c) => c.metN + c.skipN > 0) ? (
          <section aria-labelledby="steps-h" className="rounded-xl border border-line bg-card p-6">
            <h2 id="steps-h" className="mb-3 text-[15px] font-semibold">Each step, followed vs skipped</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-fg-3"><tr><th scope="col" className="pb-2 text-left font-medium">Step</th><th scope="col" className="pb-2 text-right font-medium">Followed</th><th scope="col" className="pb-2 text-right font-medium">Skipped</th></tr></thead>
              <tbody>
                {s.checklist.map((c) => (
                  <tr key={c.id} className="border-t border-line-subtle">
                    <td className="py-2.5 pr-3">{c.label}</td>
                    <td className="num py-2.5 text-right">{c.metR === null ? "—" : <span className={c.metR >= 0 ? "text-profit" : "text-loss"}>{c.metR > 0 ? "+" : ""}{c.metR}R</span>} <span className="text-xs text-fg-3">({c.metN})</span></td>
                    <td className="num py-2.5 text-right">{c.skipR === null ? "—" : <span className={c.skipR >= 0 ? "text-profit" : "text-loss"}>{c.skipR > 0 ? "+" : ""}{c.skipR}R</span>} <span className="text-xs text-fg-3">({c.skipN})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {s.recent.length ? (
          <section aria-labelledby="rec-h" className="rounded-xl border border-line bg-card p-6">
            <h2 id="rec-h" className="mb-2 text-[15px] font-semibold">Recent trades</h2>
            <ul className="divide-y divide-line-subtle">
              {s.recent.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Link href={`/trades/${t.id}`} className="w-20 font-semibold underline-offset-4 hover:underline">{t.symbol}</Link>
                  <span className="flex-1 text-fg-3">{new Date(t.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{t.grade ? ` · ${GRADE_LABEL[t.grade]}` : ""}</span>
                  <span className={`num font-semibold ${t.pnl === null ? "" : t.pnl >= 0 ? "text-profit" : "text-loss"}`}>{t.pnl === null ? "Open" : money(t.pnl, t.currency, { sign: true })}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function StepRow({ step, index, count, onLabel, onRemove, onMove }: {
  step: Step; index: number; count: number; onLabel: (l: string) => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={step} dragListener={false} dragControls={controls}
      className="flex items-center gap-2 rounded-lg border border-line bg-card px-2 py-1.5"
      whileDrag={{ scale: 1.02, boxShadow: "0 12px 30px -10px rgba(0,0,0,0.25)" }}>
      <button type="button" aria-hidden tabIndex={-1} onPointerDown={(e) => controls.start(e)} className="flex size-8 cursor-grab touch-none items-center justify-center text-fg-3 active:cursor-grabbing">
        <GripVertical size={16} />
      </button>
      <span className="num w-5 text-xs text-fg-3">{index + 1}</span>
      <label className="sr-only" htmlFor={`st-${step.id}`}>Step {index + 1}</label>
      <input id={`st-${step.id}`} value={step.label} onChange={(e) => onLabel(e.target.value)} maxLength={140}
        className="h-9 flex-1 rounded-md bg-transparent px-2 text-sm outline-none hover:bg-subtle focus:bg-subtle" />
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move step ${index + 1} up`} className="flex size-8 items-center justify-center rounded-md text-fg-3 hover:bg-subtle disabled:opacity-30"><ArrowUp size={14} /></button>
      <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move step ${index + 1} down`} className="flex size-8 items-center justify-center rounded-md text-fg-3 hover:bg-subtle disabled:opacity-30"><ArrowDown size={14} /></button>
      <button type="button" onClick={onRemove} aria-label={`Remove step ${index + 1}`} className="flex size-8 items-center justify-center rounded-md text-fg-3 hover:bg-loss-subtle hover:text-loss"><Trash2 size={14} /></button>
    </Reorder.Item>
  );
}

function Tile({ k, v, tone }: { k: string; v: string; tone?: "profit" | "loss" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-subtle p-4">
      <dt className="text-[13px] text-fg-3">{k}</dt>
      <dd className={`num text-2xl font-bold tracking-[-0.02em] ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}>{v}</dd>
    </div>
  );
}
