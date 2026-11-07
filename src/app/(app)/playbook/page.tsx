import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getPlaybook } from "@/lib/data/playbook";
import { NewStrategy } from "./new-strategy";

export const metadata: Metadata = { title: "Playbook" };

export default function PlaybookPage() {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[34px] font-bold tracking-[-0.03em]">Playbook</h1>
          <p className="text-[15px] text-fg-3">The setups you trade, the steps each one needs, and how they perform.</p>
        </div>
        <NewStrategy />
      </div>
      <Suspense fallback={<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-[200px] animate-pulse rounded-xl bg-subtle" />)}</div>}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const { user } = await requireSession();
  const items = await getPlaybook(user.id);
  if (!items.length) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-line bg-card p-10">
        <h2 className="text-xl font-bold tracking-[-0.02em]">Write down your first setup</h2>
        <p className="max-w-[560px] text-[15px] leading-relaxed text-fg-3">
          A strategy is a name and a short checklist, such as &ldquo;Waited for the candle close&rdquo;. Tick the steps on each trade and Ledger shows which ones actually make you money.
        </p>
      </section>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((s) => (
        <Link key={s.id} href={`/playbook/${s.id}`}
          className="group flex flex-col gap-5 rounded-xl border border-line bg-card p-6 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-hover">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-bold tracking-[-0.01em]">{s.name}</h2>
            <p className="line-clamp-2 min-h-[40px] text-sm text-fg-3">{s.description || `${s.steps} checklist step${s.steps === 1 ? "" : "s"}`}</p>
          </div>
          <dl className="grid grid-cols-4 gap-2 border-t border-line-subtle pt-4">
            <Mini k="Trades" v={String(s.trades)} />
            <Mini k="Win rate" v={s.winRate === null ? "—" : `${Math.round(s.winRate)}%`} />
            <Mini k="Avg R" v={s.avgR === null ? "—" : `${s.avgR > 0 ? "+" : ""}${s.avgR}`} tone={s.avgR === null ? undefined : s.avgR >= 0 ? "profit" : "loss"} />
            <Mini k="On plan" v={s.adherence === null ? "—" : `${Math.round(s.adherence)}%`} />
          </dl>
        </Link>
      ))}
    </div>
  );
}

function Mini({ k, v, tone }: { k: string; v: string; tone?: "profit" | "loss" }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] text-fg-3">{k}</dt>
      <dd className={`num text-base font-bold ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}>{v}</dd>
    </div>
  );
}
