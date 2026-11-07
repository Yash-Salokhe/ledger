import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getWeekly } from "@/lib/data/weekly";
import { WeeklyView } from "./weekly-view";

export const metadata: Metadata = { title: "Weekly review" };
type SP = Promise<{ week?: string; account?: string }>;

export default function WeeklyPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] font-bold tracking-[-0.03em]">Weekly review</h1>
        <p className="text-[15px] text-fg-3">Ten minutes on Sunday. What worked, what didn&rsquo;t, one thing to focus on.</p>
      </div>
      <Suspense fallback={<div className="flex flex-col gap-4" aria-busy="true"><div className="h-[110px] animate-pulse rounded-xl bg-subtle" /><div className="h-[420px] animate-pulse rounded-xl bg-subtle" /></div>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  const [sp, { user }] = await Promise.all([searchParams, requireSession()]);
  const data = await getWeekly(user.id, { week: sp.week, accountId: sp.account });
  if (!data) return <p className="rounded-xl border border-line bg-card p-10 text-[15px] text-fg-3">Log a trade to start your first weekly review.</p>;
  return <WeeklyView key={`${data.week}:${data.account.id}`} data={data} />;
}
