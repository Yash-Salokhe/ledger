"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { PerformanceData } from "@/lib/data/performance";
import { Columns } from "@/components/charts/columns";
import { EquityChart } from "@/components/charts/equity";
import { GRADE_LABEL } from "@/lib/trades/math";
import { money } from "@/lib/format";

const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GRADE_COLOR = { earned: "var(--chart-earned)", lucky: "var(--chart-lucky)", good_loss: "var(--chart-goodloss)", deserved: "var(--chart-deserved)" } as const;
const sR = (r: number | null) => (r === null ? "—" : `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}R`);

export function PerformanceView({ data }: { data: PerformanceData }) {
  const router = useRouter();
  const s = data.summary;
  const ccy = data.account.currency;
  const href = (o: { range?: string; account?: string }) => `/performance?range=${o.range ?? data.range}&account=${o.account ?? data.account.id}`;

  return (
    <div className="flex flex-col gap-5">
      {/* Filters: one row above the charts */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Date range" className="flex rounded-[12px] bg-subtle p-1">
          {Object.entries(data.ranges).map(([k, label]) => (
            <Link key={k} href={href({ range: k })} aria-current={data.range === k ? "page" : undefined} scroll={false}
              className={`relative rounded-[9px] px-3.5 py-2 text-sm font-semibold ${data.range === k ? "text-fg" : "text-fg-3 hover:text-fg"}`}>
              {data.range === k ? <motion.span layoutId="range-pill" className="absolute inset-0 rounded-[9px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
              <span className="relative">{label}</span>
            </Link>
          ))}
        </nav>
        {data.accounts.length > 1 ? (
          <label className="flex items-center gap-2 text-sm"><span className="text-fg-3">Account</span>
            <select value={data.account.id} onChange={(e) => router.push(href({ account: e.target.value }), { scroll: false })}
              className="h-10 rounded-md border border-line bg-card px-3 font-semibold outline-none focus:border-citron-700">
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {s.trades === 0 ? (
        <p className="rounded-xl border border-line bg-card p-10 text-[15px] text-fg-3">No closed trades in this range. Try a longer range.</p>
      ) : (
        <>
          {/* The process insight — the reason Ledger exists */}
          {s.plan.on.trades && s.plan.off.trades ? (
            <section className="flex flex-col gap-4 rounded-xl p-6 text-[#141413]" style={{ background: "linear-gradient(135deg, var(--citron-100), var(--citron-300))" }}>
              <p className="text-2xl font-bold leading-snug tracking-[-0.02em] md:text-[28px]">
                On plan you average <span className="num">{sR(s.plan.on.avgR)}</span>. Off plan, <span className="num">{sR(s.plan.off.avgR)}</span>.
              </p>
              <p className="text-sm text-citron-900">
                {s.plan.on.trades} trades on plan made {money(s.plan.on.pnl, ccy, { sign: true })}; {s.plan.off.trades} off plan made {money(s.plan.off.pnl, ccy, { sign: true })}.
              </p>
            </section>
          ) : null}

          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile k="Net P&L" v={money(s.net, ccy, { sign: true })} tone={s.net >= 0 ? "profit" : "loss"} sub={`${s.trades} trades`} />
            <Tile k="Win rate" v={s.winRate === null ? "—" : `${s.winRate}%`} />
            <Tile k="Expectancy" v={sR(s.expectancyR)} sub="per trade" />
            <Tile k="Profit factor" v={s.profitFactor === null ? "—" : s.profitFactor.toFixed(2)} />
            <Tile k="Avg win / loss" v={`${s.avgWin === null ? "—" : money(s.avgWin, ccy, { decimals: 0 })} / ${s.avgLoss === null ? "—" : money(s.avgLoss, ccy, { decimals: 0 })}`} small />
            <Tile k="Max drawdown" v={money(-s.maxDrawdown, ccy, { decimals: 0 })} sub={`${s.maxDrawdownPct}% from peak`} tone={s.maxDrawdown ? "loss" : undefined} />
          </dl>

          <Card>
            <h2 className="text-[15px] font-semibold">Balance</h2>
            <EquityChart points={s.equity} currency={ccy} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <Columns title="R distribution" caption="Trades per half-R band, labelled by where the band starts." diverging
                data={s.rDistribution.map((b, i) => ({ key: b.label, label: i === 0 ? `≤${b.hi}` : b.hi === null ? `≥${b.lo}` : `${b.lo}`, value: b.count, display: `${b.count}`, detail: `${b.label}R`, color: b.lo < 0 ? "var(--chart-loss)" : "var(--chart-profit)" }))} />
            </Card>
            <Card>
              <h2 className="text-[15px] font-semibold">By process grade</h2>
              <p className="-mt-1 text-xs text-fg-3">Total R from each grade. Lucky wins are profit your process didn&rsquo;t earn.</p>
              <GradeBars rows={s.byGrade} ungraded={s.ungraded} />
            </Card>
            <Card>
              <Columns title="By weekday" caption={`Net P&L by entry day (${data.tz}).`} diverging
                data={s.byWeekday.map((d) => ({ key: d.key, label: DOW[d.key], value: d.pnl, display: money(d.pnl, ccy, { sign: true, decimals: 0 }), detail: `${d.trades} trades · ${sR(d.avgR)}` }))} />
            </Card>
            <Card>
              <Columns title="By entry hour" caption="Average R by the hour you entered." diverging
                data={s.byHour.map((h) => ({ key: h.key, label: `${String(h.key).padStart(2, "0")}h`, value: h.avgR ?? 0, display: sR(h.avgR), detail: `${h.trades} trades` }))} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <h2 className="text-[15px] font-semibold">By market</h2>
              <table className="w-full text-sm">
                <thead className="text-xs text-fg-3"><tr>{["Market", "Trades", "Win rate", "Avg R", "Net P&L"].map((h, i) => <th key={h} scope="col" className={`pb-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {s.byMarket.map((m) => (
                    <tr key={m.key} className="border-t border-line-subtle">
                      <th scope="row" className="py-2.5 text-left font-semibold">{m.key}</th>
                      <td className="num py-2.5 text-right">{m.trades}</td>
                      <td className="num py-2.5 text-right">{m.winRate}%</td>
                      <td className="num py-2.5 text-right">{sR(m.avgR)}</td>
                      <td className={`num py-2.5 text-right font-semibold ${m.pnl >= 0 ? "text-profit" : "text-loss"}`}>{money(m.pnl, ccy, { sign: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card>
              <h2 className="text-[15px] font-semibold">Long vs short</h2>
              <dl className="grid grid-cols-2 gap-3">
                {s.bySide.map((x) => (
                  <div key={x.key} className="flex flex-col gap-1 rounded-lg bg-subtle p-4">
                    <dt className="text-[13px] text-fg-3">{x.key === "long" ? "Buys" : "Sells"} · {x.trades}</dt>
                    <dd className={`num text-xl font-bold ${x.pnl >= 0 ? "text-profit" : "text-loss"}`}>{money(x.pnl, ccy, { sign: true, decimals: 0 })}</dd>
                    <dd className="num text-xs text-fg-3">{x.winRate}% wins · {sR(x.avgR)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-3 rounded-xl border border-line bg-card p-5">{children}</section>;
}

function Tile({ k, v, sub, tone, small }: { k: string; v: string; sub?: string; tone?: "profit" | "loss"; small?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-card p-4">
      <dt className="text-xs text-fg-3">{k}</dt>
      <dd className={`num font-bold tracking-[-0.01em] ${small ? "text-base" : "text-xl"} ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}>{v}</dd>
      {sub ? <dd className="text-xs text-fg-3">{sub}</dd> : null}
    </div>
  );
}

/** Horizontal diverging bars around a centre line; colour identifies the grade, the label always names it. */
function GradeBars({ rows, ungraded }: { rows: PerformanceData["summary"]["byGrade"]; ungraded: number }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.r ?? 0)));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((g, i) => {
        const v = g.r ?? 0, w = (Math.abs(v) / max) * 50;
        return (
          <div key={g.key} className="grid grid-cols-[96px_1fr_92px] items-center gap-3 text-sm">
            <span className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-sm" style={{ background: GRADE_COLOR[g.key] }} />{GRADE_LABEL[g.key]}</span>
            <div className="relative h-6" aria-hidden>
              <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--chart-ref)]" />
              <motion.span initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className={`absolute top-1 h-4 ${v >= 0 ? "left-1/2 rounded-r" : "right-1/2 rounded-l"}`} style={{ background: GRADE_COLOR[g.key] }} />
            </div>
            <span className="num text-right"><span className="font-semibold">{sR(g.r)}</span> <span className="text-xs text-fg-3">· {g.trades}</span></span>
          </div>
        );
      })}
      {ungraded ? <Link href="/journal" className="text-xs font-semibold text-fg-3 underline underline-offset-4">{ungraded} trade{ungraded === 1 ? "" : "s"} still need a grade</Link> : null}
    </div>
  );
}
