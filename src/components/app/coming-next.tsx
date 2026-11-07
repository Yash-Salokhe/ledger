import Link from "next/link";

/** Placeholder for screens in the Figma that are scheduled in the build plan. */
export function ComingNext({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-6">
      <h1 className="text-[34px] font-bold tracking-[-0.03em]">{title}</h1>
      <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line bg-card p-10">
        <p className="max-w-[560px] text-[15px] leading-relaxed text-fg-3">{description}</p>
        <Link href="/dashboard" className="text-sm font-semibold underline underline-offset-4">Back to dashboard</Link>
      </section>
    </div>
  );
}
