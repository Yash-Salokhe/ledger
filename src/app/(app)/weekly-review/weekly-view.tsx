"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, ShieldAlert, Target, Unlock } from "lucide-react";
import type { WeeklyData } from "@/lib/data/weekly";
import { saveReflection } from "@/lib/actions/weekly";
import { GRADE_LABEL, type Grade } from "@/lib/trades/math";
import { money } from "@/lib/format";

const RULE: Record<string, string> = { max_trades_per_day: "Max trades per day", max_daily_loss: "Max daily loss", trading_window: "Trading window", max_risk_per_trade: "Max risk per trade" };
const GRADE_COLOR: Record<Grade, string> = { earned: "var(--chart-earned)", lucky: "var(--chart-lucky)", good_loss: "var(--chart-goodloss)", deserved: "var(--chart-deserved)" };
const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

export function WeeklyView({ data }: { data: WeeklyData }) {
  const router = useRouter();
  const ccy = data.account.currency;
  const s = data.stats;
  const q = (week: string) => `/weekly-review?week=${week}&account=${data.account.id}`;
  const totalGraded = Object.values(data.grades).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={q(data.prev)} aria-label="Previous week" className="flex size-10 items-center justify-center rounded-md border border-line bg-card hover:border-line-hover"><ChevronLeft size={18} /></Link>
          <h2 className="num min-w-[190px] text-center text-lg font-bold" aria-live="polite">
            {data.isCurrent ? "This week" : `${fmtDay(data.week)} – ${fmtDay(data.end)}`}
          </h2>
          {data.next ? <Link href={q(data.next)} aria-label="Next week" className="flex size-10 items-center justify-center rounded-md border border-line bg-card hover:border-line-hover"><ChevronRight size={18} /></Link> : <span className="size-10" />}
        </div>
        {data.accounts.length > 1 ? (
          <select aria-label="Account" value={data.account.id} onChange={(e) => router.push(`/weekly-review?week=${data.week}&account=${e.target.value}`)}
            className="h-10 rounded-md border border-line bg-card px-3 text-sm font-semibold outline-none focus:border-citron-700">
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        ) : null}
      </div>

      {data.lastFocus ? (
        <section className="flex items-start gap-3 rounded-xl p-5 text-[#141413]" style={{ background: "linear-gradient(135deg, var(--citron-100), var(--citron-300))" }}>
          <Target size={20} className="mt-0.5 flex-none" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="text-sm text-citron-900">Last week you said you&rsquo;d focus on</p>
            <p className="text-lg font-semibold leading-snug">{data.lastFocus}</p>
          </div>
        </section>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile k="Net P&L" v={money(s.net, ccy, { sign: true })} tone={s.net > 0 ? "profit" : s.net < 0 ? "loss" : undefined} />
        <Tile k="Trades" v={String(s.trades)} />
        <Tile k="Win rate" v={s.winRate === null ? "—" : `${s.winRate.toFixed(0)}%`} />
        <Tile k="Average R" v={s.avgR === null ? "—" : `${s.avgR > 0 ? "+" : ""}${s.avgR.toFixed(2)}R`} />
        <Tile k="On plan" v={s.onPlan === null ? "—" : `${s.onPlan.toFixed(0)}%`} />
      </dl>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col gap-5">
          <Card title="How you traded">
            {totalGraded ? (
              <>
                <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img"
                  aria-label={(Object.keys(GRADE_LABEL) as Grade[]).map((g) => `${GRADE_LABEL[g]} ${data.grades[g]}`).join(", ")}>
                  {(["earned", "lucky", "good_loss", "deserved"] as Grade[]).map((g) => data.grades[g] ? <span key={g} style={{ flex: data.grades[g], background: GRADE_COLOR[g] }} /> : null)}
                </div>
                <ul className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
                  {(["earned", "lucky", "good_loss", "deserved"] as Grade[]).map((g) => (
                    <li key={g} className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: GRADE_COLOR[g] }} />{GRADE_LABEL[g]} <span className="num ml-auto font-semibold">{data.grades[g]}</span></li>
                  ))}
                </ul>
              </>
            ) : <p className="text-sm text-fg-3">No graded trades this week.</p>}
            {s.ungraded ? <Link href="/journal" className="text-sm font-semibold underline underline-offset-4">Grade {s.ungraded} trade{s.ungraded === 1 ? "" : "s"}</Link> : null}
          </Card>

          <Card title="Rules">
            {data.violations.length === 0 && data.overrides.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-profit"><Check size={16} aria-hidden /> You kept every rule this week.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {data.overrides.map((o, i) => (
                  <li key={`o${i}`} className="flex gap-3">
                    <Unlock size={16} className="mt-0.5 flex-none text-lucky" aria-hidden />
                    <span><strong>{fmtDay(o.day, { weekday: "short" })}:</strong> you overrode &ldquo;{RULE[o.kind]}&rdquo;{o.reason ? <span className="text-fg-3"> because &ldquo;{o.reason}&rdquo;</span> : null}</span>
                  </li>
                ))}
                {data.violations.map((v) => (
                  <li key={v.id} className="flex gap-3">
                    <ShieldAlert size={16} className="mt-0.5 flex-none text-loss" aria-hidden />
                    <span><Link href={`/trades/${v.tradeId}`} className="font-semibold underline-offset-4 hover:underline">{v.symbol}</Link> on {fmtDay(v.openedAt, { weekday: "short" })} broke &ldquo;{RULE[v.kind]}&rdquo;{v.overridden ? " under an override" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.best || data.worst ? (
            <Card title="Best and worst">
              {[data.best, data.worst].filter(Boolean).map((t) => (
                <Link key={t!.id} href={`/trades/${t!.id}`} className="flex items-center gap-3 rounded-lg bg-subtle px-3 py-2.5 text-sm hover:bg-[var(--row-hover)]">
                  <span className="font-semibold">{t!.symbol}</span>
                  <span className="text-fg-3">{fmtDay(t!.openedAt, { weekday: "short" })}{t!.grade ? ` · ${GRADE_LABEL[t!.grade]}` : ""}</span>
                  <span className={`num ml-auto font-semibold ${t!.pnl >= 0 ? "text-profit" : "text-loss"}`}>{money(t!.pnl, ccy, { sign: true })}</span>
                </Link>
              ))}
            </Card>
          ) : null}
        </div>

        <Card title="Reflection">
          <Reflect data={data} field="wentWell" label="What went well?" placeholder="The trade or habit you want to repeat." />
          <Reflect data={data} field="toImprove" label="What would you do differently?" placeholder="Be specific: the moment, the rule, the feeling." />
          <Reflect data={data} field="focusNext" label="One focus for next week" placeholder="e.g. No trades before the London open." single />
        </Card>
      </div>
    </div>
  );
}

function Reflect({ data, field, label, placeholder, single }: { data: WeeklyData; field: "wentWell" | "toImprove" | "focusNext"; label: string; placeholder: string; single?: boolean }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = `wr-${field}`;
  const onChange = (value: string) => {
    clearTimeout(timer.current);
    setState("saving");
    timer.current = setTimeout(async () => {
      const r = await saveReflection({ accountId: data.account.id, weekStart: data.week, field, value });
      setState("error" in r ? "error" : "saved");
    }, 700);
  };
  const cls = "w-full rounded-md border border-line bg-card px-3.5 py-3 text-[15px] leading-relaxed outline-none focus:border-citron-700 focus:shadow-[0_0_0_4px_rgba(228,227,58,0.35)]";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        <span aria-live="polite" className={`flex items-center gap-1 text-xs ${state === "error" ? "text-loss" : "text-fg-3"}`}>
          {state === "saving" ? <><Loader2 size={11} className="animate-spin" aria-hidden />Saving</> : state === "saved" ? <><Check size={11} aria-hidden />Saved</> : state === "error" ? "Not saved" : null}
        </span>
      </div>
      {single
        ? <input id={id} defaultValue={data.review[field]} placeholder={placeholder} maxLength={300} onChange={(e) => onChange(e.target.value)} className={`${cls} h-12 py-0`} />
        : <textarea id={id} rows={5} defaultValue={data.review[field]} placeholder={placeholder} maxLength={5000} onChange={(e) => onChange(e.target.value)} className={`${cls} resize-y`} />}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-xl border border-line bg-card p-6"><h2 className="text-[15px] font-semibold">{title}</h2>{children}</section>;
}

function Tile({ k, v, tone }: { k: string; v: string; tone?: "profit" | "loss" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-card p-4">
      <dt className="text-xs text-fg-3">{k}</dt>
      <dd className={`num text-xl font-bold ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}>{v}</dd>
    </div>
  );
}
