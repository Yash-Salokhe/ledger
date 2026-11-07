"use client";
import { createContext, use, useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";

type Toast = { id: number; message: string; action?: { label: string; run: () => void } };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

/** Bottom-centre toast from the Figma ("16 Saved toast"). One at a time, 5 s, announced politely. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((t: Omit<Toast, "id">) => {
    clearTimeout(timer.current);
    setToast({ ...t, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  return (
    <Ctx value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 md:bottom-6 flex justify-center px-4">
        <AnimatePresence>
          {toast ? (
            <motion.div key={toast.id} initial={{ y: 24, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 500, damping: 34 } }}
              exit={{ y: 12, opacity: 0, transition: { duration: 0.15 } }}
              className="pointer-events-auto flex items-center gap-4 rounded-full bg-[#141413] py-2.5 pl-3 pr-2.5 text-sm text-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)]">
              <span className="flex size-6 items-center justify-center rounded-full bg-citron text-[#141413]"><Check size={14} aria-hidden /></span>
              {toast.message}
              {toast.action ? (
                <button type="button" onClick={() => { toast.action?.run(); setToast(null); }} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">
                  {toast.action.label}
                </button>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Ctx>
  );
}

export const useToast = () => use(Ctx);
