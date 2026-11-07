import type { Metadata } from "next";
import { Suspense } from "react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withUser } from "@/lib/db";
import { instrument, tradingAccount } from "@/lib/db/schema";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "Import trades" };

export default function ImportPage() {
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] font-bold tracking-[-0.03em]">Import trades</h1>
        <p className="text-[15px] text-fg-3">Bring your history from MetaTrader 5, Zerodha or any CSV. Importing the same file twice never creates duplicates.</p>
      </div>
      <Suspense fallback={<div className="h-[360px] animate-pulse rounded-xl bg-subtle" aria-busy="true" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const { user } = await requireSession();
  const { accounts, instruments } = await withUser(user.id, async (tx) => ({
    accounts: await tx.select({ id: tradingAccount.id, name: tradingAccount.name, currency: tradingAccount.currency })
      .from(tradingAccount).where(and(eq(tradingAccount.userId, user.id), isNull(tradingAccount.archivedAt), eq(tradingAccount.isDemoData, false))).orderBy(asc(tradingAccount.createdAt)),
    instruments: await tx.select({ id: instrument.id, symbol: instrument.symbol, exchange: instrument.exchange }).from(instrument).orderBy(asc(instrument.symbol)),
  }));
  return <ImportFlow accounts={accounts} instruments={instruments} />;
}
