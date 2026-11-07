import type { Metadata } from "next";
import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getTradeFormData } from "@/lib/data/trade-form";
import { getTradeGate } from "@/lib/data/gate";
import { TradeForm } from "./trade-form";

export const metadata: Metadata = { title: "New trade" };

export default function NewTradePage() {
  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] font-bold tracking-[-0.03em]">New trade</h1>
        <p className="text-[15px] text-fg-3">Log what you did and whether you followed your plan.</p>
      </div>
      <Suspense fallback={<div className="h-[640px] animate-pulse rounded-xl bg-subtle" aria-busy="true" />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const { user } = await requireSession();
  const [data, gate] = await Promise.all([getTradeFormData(user.id), getTradeGate(user.id)]);
  return <TradeForm data={data} gate={{ canTrade: gate.canTrade, lockReason: gate.lockReason }} />;
}
