"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import type { CalendarData } from "@/lib/data/calendar";
import { money } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Intensity step 1–3 relative to the month's biggest day (Figma calendar tokens profit-1..3 / loss-1..3). */
const tint = (pnl: number, maxAbs: number) => {
  const step = Math.min(3, Math.max(1, Math.ceil((Math.abs(pnl) / maxAbs) * 3)));
  return pnl >= 0 ? `var(--profit-${step})` : `var(--loss-${step})`;
};
const compact = (n: number, ccy: string) => {
  const a = Math.abs(n);
  const s = a >= 1e7 && ccy === "INR" ? `${(a / 1e7).toFixed(1)}Cr` : a >= 1e5 && ccy === "INR" ? `${(a / 1e5).toFixed(1)}L` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${(a / 1e3).toFixed(1)}k` : a.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${s}`;
};

export function CalendarView({ data }: { data: CalendarData }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const ccy = data.account.currency;
  const [y, m] = data.month.split("-").map(Number);
  const daysInMonth = Number(data.last.slice(8));
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${data.month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const q = (month: string) => `/calendar?m=${month}&account=${data.account.id}`;
  const s = data.summary;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={q(data.prev)} aria-label="Previous month" className="flex size-10 items-center justify-center rounded-md border border-line bg-card hover:border-line-hover"><ChevronLeft size={18} /></Link>
          <h2 className="num min-w-[170px] text-center text-lg font-bold" aria-live="polite">{title}</h2>
          {data.next ? <Link href={q(data.next)} aria-label="Next month" className="flex size-10 items-center justify-center rounded-md border border-line bg-card hover:border-line-hover"><ChevronRight size={18} /></Link>
            : <span className="size-10" />}
        </div>
        {data.accounts.length > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-fg-3">Account</span>
            <select value={data.account.id} onChange={(e) => router.push(`/calendar?m=${data.month}&account=${e.target.value}`)}
              className="h-10 rounded-md border border-line bg-card px-3 font-semibold outline-none focus:border-citron-700">
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Sum k="Month" v={money(s.net, ccy, { sign: true })} tone={s.net >= 0 ? "profit" : "loss"} />
        <Sum k="Green days" v={s.tradingDays ? `${s.greenDays} of ${s.tradingDays}` : "—"} />
        <Sum k="Best / worst day" v={s.best === null ? "—" : `${compact(s.best, ccy)} / ${compact(s.worst!, ccy)}`} />
        <Sum k="Days with broken rules" v={String(s.violationDays)} tone={s.violationDays ? "loss" : undefined} />
      </dl>

      <div className="overflow-x-auto rounded-xl border border-line bg-card p-3 sm:p-4">
        <table className="w-full min-w-[720px] border-separate border-spacing-[6px] text-sm" aria-label={`${title}, daily P&L`}>
          <thead>
            <tr>{[...WEEKDAYS, "Week"].map((d) => <th key={d} scope="col" className="pb-1 text-left text-xs font-medium text-fg-3">{d}</th>)}</tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => {
              const wk = week.filter(Boolean).map((d) => data.days[d!]).filter(Boolean);
              const wsum = wk.reduce((a, d) => a + d.pnl, 0);
              return (
                <tr key={wi}>
                  {week.map((day, di) => {
                    if (!day) return <td key={di} />;
                    const d = data.days[day];
                    const isToday = day === data.today;
                    const label = d
                      ? `${day}: ${money(d.pnl, ccy, { sign: true })}, ${d.trades} trade${d.trades === 1 ? "" : "s"}, ${d.onPlan} on plan${d.violations ? `, ${d.violations} rule broken` : ""}`
                      : `${day}: no trades`;
                    const inner = (
                      <motion.div
                        initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: reduce ? 0 : (wi * 7 + di) * 0.008 }}
                        className={`relative flex h-[88px] flex-col justify-between rounded-lg p-2.5 ${d ? "" : "bg-subtle"} ${isToday ? "ring-2 ring-fg" : ""}`}
                        style={d ? { background: tint(d.pnl, data.maxAbs) } : undefined}>
                        <span className="num flex items-center justify-between text-xs text-fg-2">
                          {Number(day.slice(8))}
                          {d?.violations ? <ShieldAlert size={13} className="text-loss" aria-hidden /> : null}
                        </span>
                        {d ? (
                          <span className="flex flex-col">
                            <span className={`num text-[15px] font-bold ${d.pnl >= 0 ? "text-profit" : "text-loss"}`}>{compact(d.pnl, ccy)}</span>
                            <span className="text-[11px] text-fg-2">{d.trades} trade{d.trades === 1 ? "" : "s"}{d.r ? ` · ${d.r > 0 ? "+" : ""}${d.r.toFixed(1)}R` : ""}</span>
                          </span>
                        ) : null}
                      </motion.div>
                    );
                    return (
                      <td key={di} className="p-0 align-top">
                        {d ? <Link href={`/journal?day=${day}`} aria-label={label} title={label} className="block rounded-lg transition-transform hover:-translate-y-0.5">{inner}</Link>
                          : <div aria-label={label}>{inner}</div>}
                      </td>
                    );
                  })}
                  <td className="p-0 align-top">
                    <div className="flex h-[88px] flex-col justify-end rounded-lg border border-line-subtle p-2.5">
                      {wk.length ? <span className={`num text-sm font-bold ${wsum >= 0 ? "text-profit" : "text-loss"}`}>{compact(wsum, ccy)}</span> : <span className="text-xs text-fg-3">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center gap-4 px-1.5 text-xs text-fg-3">
          <span className="flex items-center gap-1.5">Loss {[3, 2, 1].map((i) => <span key={i} className="size-3.5 rounded" style={{ background: `var(--loss-${i})` }} />)}</span>
          <span className="flex items-center gap-1.5">{[1, 2, 3].map((i) => <span key={i} className="size-3.5 rounded" style={{ background: `var(--profit-${i})` }} />)} Profit</span>
          <span className="flex items-center gap-1.5"><ShieldAlert size={13} className="text-loss" aria-hidden /> Rule broken</span>
          <span>Shade is relative to this month&rsquo;s biggest day.</span>
        </div>
      </div>
    </div>
  );
}

function Sum({ k, v, tone }: { k: string; v: string; tone?: "profit" | "loss" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-card p-4">
      <dt className="text-xs text-fg-3">{k}</dt>
      <dd className={`num text-lg font-bold ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}>{v}</dd>
    </div>
  );
}
