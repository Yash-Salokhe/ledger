import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, FileUp, Plus } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getDashboard } from "@/lib/data/dashboard";
import { linePath, money, pct, signed } from "@/lib/format";
import { Reveal } from "@/components/app/reveal";

export const metadata: Metadata = { title: "Dashboard" };

const GRADE: Record<string, { label: string; cls: string }> = {
  earned: { label: "Earned it", cls: "bg-profit-subtle text-profit" },
  good_loss: { label: "Good loss", cls: "bg-goodloss-subtle text-goodloss" },
  lucky: { label: "Lucky", cls: "bg-lucky-subtle text-lucky" },
  deserved: { label: "Deserved it", cls: "bg-loss-subtle text-loss" },
};

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] font-bold tracking-[-0.03em]">Dashboard</h1>
        <p className="text-[15px] text-fg-3">How your process is turning into results.</p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

/** Same footprint as the real cards, so nothing shifts when data arrives (CLS ≈ 0). */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-[340px] animate-pulse rounded-xl bg-citron-50" />
        <div className="h-[340px] animate-pulse rounded-xl bg-subtle" />
      </div>
      <div className="h-[300px] animate-pulse rounded-xl bg-subtle" />
    </div>
  );
}

async function DashboardContent() {
  const { user } = await requireSession();
  const d = await getDashboard(user.id);
  return (
    <>
      {!d || d.trades === 0 ? <EmptyState hasAccount={Boolean(d)} /> : (
        <>
          {d.byInstrument.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">P&amp;L by market</span>
              {d.byInstrument.map((b) => (
                <span key={b.symbol} className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5">
                  <span className="font-semibold">{b.symbol}</span>
                  <span className="text-fg-3">{b.n} trades</span>
                  <span className={`num font-semibold ${b.pnl >= 0 ? "text-profit" : "text-loss"}`}>{money(b.pnl, d.account.currency, { sign: true })}</span>
                </span>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Reveal>
              <section aria-labelledby="bal" className="flex h-full flex-col gap-2 rounded-xl p-6 text-[#141413]"
                style={{ background: "linear-gradient(135deg, var(--citron-100) 0%, var(--citron-300) 60%, var(--citron-400) 100%)" }}>
                <div className="flex items-center justify-between">
                  <h2 id="bal" className="text-[15px] font-semibold">Account balance</h2>
                  <span className="text-sm text-citron-900">Opening {money(d.opening, d.account.currency, { decimals: 0 })}</span>
                </div>
                <p className="num text-[56px] font-bold leading-none tracking-[-0.04em]">{money(d.balance, d.account.currency)}</p>
                <p className="flex items-center gap-2 text-sm">
                  <span className="num rounded-full bg-white/60 px-2.5 py-1 font-semibold text-profit">{signed(d.changePct)}%</span>
                  <span className="text-citron-900">all time · {d.trades} trades</span>
                </p>
                <svg viewBox="0 0 600 160" className="mt-2 h-40 w-full" role="img" aria-label="Balance over time">
                  <path d={linePath(d.curve, 600, 160)} fill="none" stroke="#2d2700" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" className="draw-line" />
                </svg>
              </section>
            </Reveal>

            <Reveal delay={0.05}>
              <section aria-labelledby="kf" className="flex h-full flex-col gap-4 rounded-xl border border-line bg-card p-6">
                <h2 id="kf" className="text-[15px] font-semibold">Key figures</h2>
                <div className="grid flex-1 grid-cols-2 gap-3">
                  <Figure label="Win rate" value={pct(d.winRate)} sub={`${d.wins}W · ${d.losses}L`} />
                  <Figure label="Profit factor" value={d.profitFactor ? d.profitFactor.toFixed(2) : "—"} sub="gross win ÷ loss" />
                  <Figure label="Expectancy" value={money(d.expectancy, d.account.currency, { sign: true })} sub="per closed trade" tone={d.expectancy >= 0 ? "profit" : "loss"} />
                  <Figure label="Plan adherence" value={d.planAdherence === null ? "—" : pct(d.planAdherence, 0)} sub="trades on plan" meter={d.planAdherence ?? undefined} />
                </div>
              </section>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <section aria-labelledby="rt" className="rounded-xl border border-line bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="rt" className="text-[15px] font-semibold">Recent trades</h2>
                <Link href="/journal" className="flex items-center gap-1 text-sm font-semibold">View all <ArrowUpRight size={14} aria-hidden /></Link>
              </div>
              <ul className="divide-y divide-line-subtle">
                {d.recent.map((t) => (
                  <li key={t.id} className="flex items-center gap-4 py-3">
                    <span className="w-24 font-semibold">{t.symbol}</span>
                    <span className="w-14 text-sm capitalize text-fg-3">{t.side}</span>
                    <span className="flex-1 text-sm text-fg-3">{new Date(t.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    {t.grade ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${GRADE[t.grade].cls}`}>{GRADE[t.grade].label}</span>
                      : <span className="rounded-full bg-citron-100 px-2.5 py-1 text-xs font-semibold text-citron-900">Needs grade</span>}
                    <span className={`num w-28 text-right font-semibold ${Number(t.pnl) >= 0 ? "text-profit" : "text-loss"}`}>{money(Number(t.pnl ?? 0), d.account.currency, { sign: true })}</span>
                  </li>
                ))}
              </ul>
            </section>
          </Reveal>
        </>
      )}
    </>
  );
}

function Figure({ label, value, sub, tone, meter }: { label: string; value: string; sub: string; tone?: "profit" | "loss"; meter?: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-subtle p-4">
      <span className="text-[13px] text-fg-3">{label}</span>
      <span className={`num text-[26px] font-bold tracking-[-0.02em] ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}>{value}</span>
      <span className="text-xs text-fg-3">{sub}</span>
      {meter !== undefined ? (
        <span className="mt-1 h-1 overflow-hidden rounded bg-[var(--meter-track)]"><span className="block h-full bg-[var(--meter-fill)]" style={{ width: `${meter}%` }} /></span>
      ) : null}
    </div>
  );
}

function EmptyState({ hasAccount }: { hasAccount: boolean }) {
  return (
    <section className="flex flex-col items-start gap-5 rounded-xl border border-line bg-card p-10">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold tracking-[-0.02em]">Your journal starts with one trade</h2>
        <p className="max-w-[520px] text-[15px] leading-relaxed text-fg-3">
          Log a trade by hand, import a CSV from your broker, or connect a broker to sync automatically.
          {hasAccount ? "" : " You'll set up your first trading account on the way."}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/trades/new" className="flex h-11 items-center gap-2 rounded-md bg-citron px-4 text-sm font-semibold text-[#141413]"><Plus size={16} aria-hidden />Log a trade</Link>
        <Link href="/import" className="flex h-11 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold"><FileUp size={16} aria-hidden />Import trades</Link>
      </div>
    </section>
  );
}
