import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getPerformance } from "@/lib/data/performance";
import { PerformanceView } from "./performance-view";

export const metadata: Metadata = { title: "Performance" };
type SP = Promise<{ account?: string; range?: string }>;

export default function PerformancePage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] font-bold tracking-[-0.03em]">Performance</h1>
        <p className="text-[15px] text-fg-3">Where your edge comes from, and where it leaks.</p>
      </div>
      <Suspense fallback={<div className="flex flex-col gap-4" aria-busy="true"><div className="h-[120px] animate-pulse rounded-xl bg-subtle" /><div className="h-[300px] animate-pulse rounded-xl bg-subtle" /><div className="grid gap-4 lg:grid-cols-2"><div className="h-[280px] animate-pulse rounded-xl bg-subtle" /><div className="h-[280px] animate-pulse rounded-xl bg-subtle" /></div></div>}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  const [sp, { user }] = await Promise.all([searchParams, requireSession()]);
  const data = await getPerformance(user.id, { accountId: sp.account, range: sp.range });
  if (!data) return <p className="rounded-xl border border-line bg-card p-10 text-[15px] text-fg-3">Log a few trades to see your performance.</p>;
  return <PerformanceView data={data} />;
}
