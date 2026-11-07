"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { completeTour } from "@/lib/actions/tour";
import { loadSampleJournal } from "@/lib/actions/trades";
import { useQueryParam } from "@/lib/use-query-param";

type Step = { target: string; title: string; body: string };
const STEPS: Step[] = [
  { target: "new-trade", title: "Log every trade here", body: "Enter what you did, then answer one question: did you follow your plan? Ledger grades the trade from that, not from the P&L alone." },
  { target: "nav-settings", title: "Set rules you can't quietly break", body: "Cap trades per day or daily loss in Settings. When you hit a limit, New trade locks. You can override it, but Ledger remembers." },
  { target: "nav-journal", title: "Review and grade", body: "Every trade lands in the Journal. Open one to tick your checklist, tag how you felt and link a chart." },
  { target: "nav-performance", title: "See where your edge comes from", body: "Performance splits results by plan, grade, weekday and hour. The Calendar and Weekly review close the loop." },
];

/**
 * First-run tour: a spotlight on real UI (elements marked data-tour="…"), one card per step,
 * Back / Next / Skip, Esc to skip, arrow keys to move. Shown once for new accounts (?tour=1).
 */
export function Tour({ seen }: { seen: boolean }) {
  const router = useRouter();
  const param = useQueryParam("tour");
  const reduce = useReducedMotion();
  const [dismissed, setDismissed] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const open = param === "1" && !seen && !dismissed;
  const isLast = i === STEPS.length;

  const finish = useCallback(async (sample = false) => {
    setDismissed(true);
    router.replace("/dashboard", { scroll: false });
    await completeTour();
    if (sample) await loadSampleJournal();
  }, [router]);

  // Measure the highlighted element (the desktop sidebar or the phone tab bar, whichever is visible).
  useLayoutEffect(() => {
    if (!open || isLast) return;
    const measure = () => {
      const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${STEPS[i].target}"]`)].find((e) => e.offsetParent !== null);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, i, isLast]);

  useEffect(() => {
    if (!open) return;
    card.current?.querySelector<HTMLElement>("[data-primary]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
      if (e.key === "ArrowRight") setI((x) => Math.min(STEPS.length, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, i, finish]);

  if (!open) return null;

  const pad = 8;
  const hole = rect && !isLast ? { x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 } : null;
  // Place the card beside the target, kept inside the viewport.
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth, vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const cw = Math.min(360, vw - 32);
  const pos = !hole ? { left: (vw - cw) / 2, top: vh / 2 - 140 }
    : hole.x + hole.w + cw + 24 < vw ? { left: hole.x + hole.w + 16, top: Math.min(Math.max(16, hole.y), vh - 260) }
    : hole.y + hole.h + 220 < vh ? { left: Math.min(Math.max(16, hole.x + hole.w - cw), vw - cw - 16), top: hole.y + hole.h + 16 }
    : { left: Math.min(Math.max(16, hole.x), vw - cw - 16), top: Math.max(16, hole.y - 236) };
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 34 };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      <svg className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {hole ? <motion.rect initial={false} animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }} transition={spring} rx="14" fill="black" /> : null}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(10,10,10,0.62)" mask="url(#tour-mask)" />
        {hole ? <motion.rect initial={false} animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }} transition={spring} rx="14" fill="none" stroke="#e4e33a" strokeWidth="2" /> : null}
      </svg>

      <AnimatePresence mode="wait">
        <motion.div key={i} ref={card} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}
          className="absolute flex flex-col gap-3 rounded-xl border border-line bg-raised p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)]"
          style={{ left: pos.left, top: pos.top, width: cw }}>
          {isLast ? (
            <>
              <h2 id="tour-title" className="text-lg font-bold tracking-[-0.01em]">You&rsquo;re set</h2>
              <p id="tour-body" className="text-sm leading-relaxed text-fg-2">Log your first trade, or explore a sample journal first. The sample disappears the moment you log a real trade.</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <button type="button" data-primary onClick={() => { void finish(); router.push("/trades/new"); }} className="h-10 rounded-md bg-citron px-4 text-sm font-semibold text-[#141413]">Log my first trade</button>
                <button type="button" onClick={() => void finish(true)} className="h-10 rounded-md border border-line px-4 text-sm font-semibold">Explore sample data</button>
              </div>
            </>
          ) : (
            <>
              <p className="num text-xs text-fg-3">{i + 1} of {STEPS.length}</p>
              <h2 id="tour-title" className="text-lg font-bold tracking-[-0.01em]">{STEPS[i].title}</h2>
              <p id="tour-body" className="text-sm leading-relaxed text-fg-2">{STEPS[i].body}</p>
              <div className="mt-1 flex items-center gap-2">
                <button type="button" onClick={() => void finish()} className="mr-auto text-sm font-semibold text-fg-3 hover:text-fg">Skip tour</button>
                {i > 0 ? <button type="button" onClick={() => setI(i - 1)} className="h-10 rounded-md px-3 text-sm font-semibold">Back</button> : null}
                <button type="button" data-primary onClick={() => setI(i + 1)} className="h-10 rounded-md bg-fg px-4 text-sm font-semibold text-page">Next</button>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
