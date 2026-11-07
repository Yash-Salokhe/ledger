import Link from "next/link";

export default function TradeNotFound() {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-line bg-card p-10">
      <h1 className="text-2xl font-bold tracking-[-0.02em]">Trade not found</h1>
      <p className="text-[15px] text-fg-3">It may have been deleted, or the link is wrong.</p>
      <Link href="/journal" className="mt-2 flex h-11 items-center rounded-md bg-fg px-4 text-sm font-semibold text-page">Back to Journal</Link>
    </section>
  );
}
