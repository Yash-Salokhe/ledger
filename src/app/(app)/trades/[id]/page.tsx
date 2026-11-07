import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getTradeDetail } from "@/lib/data/trade";
import { TradeReview } from "./trade-review";

export const metadata: Metadata = { title: "Trade review" };

export default function TradePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
      <Link href="/journal" className="flex items-center gap-1.5 self-start text-sm font-semibold text-fg-3 hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> Journal
      </Link>
      <Suspense fallback={<ReviewSkeleton />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { user }] = await Promise.all([params, requireSession()]);
  const t = await getTradeDetail(user.id, id);
  if (!t) notFound();
  // Remount when the server copy changes (plan switch, new chart link), so local state never goes stale.
  return <TradeReview key={`${t.version}:${t.attachments.length}:${t.strategy?.id ?? ""}`} trade={t} />;
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading trade">
      <div className="h-[132px] animate-pulse rounded-xl bg-subtle" />
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="h-[420px] animate-pulse rounded-xl bg-subtle" />
        <div className="h-[420px] animate-pulse rounded-xl bg-subtle" />
      </div>
    </div>
  );
}
