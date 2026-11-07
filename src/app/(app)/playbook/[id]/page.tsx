import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getStrategy } from "@/lib/data/playbook";
import { StrategyEditor } from "./strategy-editor";

export const metadata: Metadata = { title: "Strategy" };

export default function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <Link href="/playbook" className="flex items-center gap-1.5 self-start text-sm font-semibold text-fg-3 hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> Playbook
      </Link>
      <Suspense fallback={<div className="h-[560px] animate-pulse rounded-xl bg-subtle" aria-busy="true" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { user }] = await Promise.all([params, requireSession()]);
  const s = await getStrategy(user.id, id);
  if (!s) notFound();
  return <StrategyEditor strategy={s} />;
}
