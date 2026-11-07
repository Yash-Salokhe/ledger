import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getCalendar } from "@/lib/data/calendar";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };

type SP = Promise<{ m?: string; account?: string }>;

export default function CalendarPage({ searchParams }: { searchParams: SP }) {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] font-bold tracking-[-0.03em]">Calendar</h1>
        <p className="text-[15px] text-fg-3">Every trading day at a glance, and the days you broke your rules.</p>
      </div>
      <Suspense fallback={<div className="h-[640px] animate-pulse rounded-xl bg-subtle" aria-busy="true" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  const [sp, { user }] = await Promise.all([searchParams, requireSession()]);
  const data = await getCalendar(user.id, { month: sp.m, accountId: sp.account });
  if (!data) {
    return <p className="rounded-xl border border-line bg-card p-10 text-[15px] text-fg-3">Log a trade to start filling your calendar.</p>;
  }
  return <CalendarView data={data} />;
}
