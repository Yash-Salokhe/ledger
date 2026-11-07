"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Lock, Plus, ShieldAlert } from "lucide-react";
import type { Finding } from "@/lib/rules/engine";

/**
 * New trade. When a blocking rule applies the button is greyed out (still focusable,
 * so keyboard and screen-reader users hear why) and opens an explanation instead.
 * When the user has overridden a rule for today, it works but warns first.
 */
export function NewTradeButton({ canTrade, lockReason, findings }: { canTrade: boolean; lockReason?: string; findings: Finding[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const overridden = findings.find((f) => f.overridden && f.severity === "block");
  const blocking = findings.find((f) => f.severity === "block" && !f.overridden);
  const shown = blocking ?? overridden;

  const onClick = () => {
    if (!canTrade || overridden) return setOpen(true);
    router.push("/trades/new");
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.97 }}
        aria-disabled={!canTrade}
        title={lockReason}
        className={`flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors ${
          canTrade ? "bg-citron text-[#141413] hover:brightness-[0.97]" : "cursor-not-allowed bg-subtle text-fg-3"
        }`}
      >
        {canTrade ? <Plus size={16} aria-hidden /> : <Lock size={15} aria-hidden />}
        New trade
      </motion.button>

      <RuleDialog open={open} onClose={() => setOpen(false)} finding={shown} canTrade={canTrade} />
    </>
  );
}

function RuleDialog({ open, onClose, finding, canTrade }: { open: boolean; onClose: () => void; finding?: Finding; canTrade: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && finding ? (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            ref={ref}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="rule-title"
            aria-describedby="rule-body"
            initial={{ y: 16, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1, transition: { type: "spring", stiffness: 420, damping: 32 } }}
            exit={{ y: 8, opacity: 0, transition: { duration: 0.12 } }}
            className="relative flex w-full max-w-[420px] flex-col gap-4 rounded-xl border border-line bg-card p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)]"
          >
            <span className="flex size-11 items-center justify-center rounded-lg bg-loss-subtle text-loss"><ShieldAlert size={22} aria-hidden /></span>
            <div className="flex flex-col gap-1.5">
              <h2 id="rule-title" className="text-xl font-bold tracking-[-0.02em]">{finding.title}</h2>
              <p id="rule-body" className="text-[15px] leading-relaxed text-fg-2">{finding.message}</p>
            </div>
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              {canTrade ? (
                <>
                  <button type="button" data-autofocus onClick={onClose} className="h-11 rounded-md border border-line px-4 text-sm font-semibold">Not now</button>
                  <Link href="/trades/new" className="flex h-11 items-center rounded-md bg-loss px-4 text-sm font-semibold text-white">Log it anyway</Link>
                </>
              ) : (
                <>
                  <Link href="/settings#rules" className="flex h-11 items-center rounded-md border border-line px-4 text-sm font-semibold">Change rule in Settings</Link>
                  <button type="button" data-autofocus onClick={onClose} className="h-11 rounded-md bg-fg px-4 text-sm font-semibold text-page">Got it</button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
