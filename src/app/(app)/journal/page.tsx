import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getJournal } from "@/lib/data/journal";
import { JournalTable } from "./journal-table";

export const metadata: Metadata = { title: "Journal" };

type SP = Promise<{ day?: string }>;

export default function JournalPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[34px] font-bold tracking-[-0.03em]">Journal</h1>
          <p className="text-[15px] text-fg-3">Every trade, its grade and whether it followed the plan.</p>
        </div>
      </div>
      <Suspense fallback={<div className="h-[520px] animate-pulse rounded-xl bg-subtle" aria-busy="true" />}>
        <Rows searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Rows({ searchParams }: { searchParams: SP }) {
  const [sp, { user }] = await Promise.all([searchParams, requireSession()]);
  const { rows, day } = await getJournal(user.id, { day: sp.day });
  const filter = day ? (
    <p className="flex items-center gap-3 text-sm">
      <span className="rounded-full bg-subtle px-3 py-1.5 font-semibold">
        Trades on {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
      </span>
      <Link href="/journal" className="font-semibold underline underline-offset-4">Show all trades</Link>
    </p>
  ) : null;
  if (!rows.length && day) return <>{filter}<p className="rounded-xl border border-line bg-card p-8 text-[15px] text-fg-3">No trades on this day.</p></>;
  if (!rows.length) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-xl border border-line bg-card p-10">
        <h2 className="text-xl font-bold tracking-[-0.02em]">No trades yet</h2>
        <p className="text-[15px] text-fg-3">Log your first trade and grade it against your plan.</p>
        <Link href="/trades/new" className="flex h-11 items-center gap-2 rounded-md bg-citron px-4 text-sm font-semibold text-[#141413]"><Plus size={16} aria-hidden />Log a trade</Link>
      </section>
    );
  }
  return <>{filter}<JournalTable rows={rows.map((r) => ({ ...r, openedAt: r.openedAt.toISOString(), pnl: r.pnl === null ? null : Number(r.pnl), r: r.r === null ? null : Number(r.r) }))} /></>;
}
