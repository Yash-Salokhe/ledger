import Link from "next/link";
import { LedgerMark } from "@/components/ledger-mark";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page px-6 text-center">
      <LedgerMark size={36} />
      <h1 className="text-3xl font-bold tracking-[-0.03em]">This page isn&rsquo;t in the ledger</h1>
      <p className="text-[15px] text-fg-3">The link may be old or mistyped.</p>
      <Link href="/dashboard" className="mt-2 flex h-11 items-center rounded-md bg-citron px-4 text-sm font-semibold text-[#141413]">Go to dashboard</Link>
    </main>
  );
}
