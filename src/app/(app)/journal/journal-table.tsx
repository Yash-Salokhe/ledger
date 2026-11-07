"use client";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Trash2 } from "lucide-react";
import { deleteTrade, restoreTrade } from "@/lib/actions/trades";
import { useToast } from "@/components/app/toast";
import { useQueryParam } from "@/lib/use-query-param";
import { GRADE_LABEL, type Grade } from "@/lib/trades/math";
import { money } from "@/lib/format";

type Row = {
  id: string; openedAt: string; side: "long" | "short"; status: "open" | "closed"; symbol: string; exchange: string;
  strategy: string | null; pnl: number | null; r: number | null; grade: Grade | null; currency: string; account: string; isDemo: boolean;
};

const GRADE_CLS: Record<Grade, string> = {
  earned: "bg-profit-subtle text-profit", good_loss: "bg-goodloss-subtle text-goodloss",
  lucky: "bg-lucky-subtle text-lucky", deserved: "bg-loss-subtle text-loss",
};

export function JournalTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const toast = useToast();
  const saved = useQueryParam("saved");
  const [, start] = useTransition();
  const [confirm, setConfirm] = useState<Row | null>(null);
  // Optimistic delete: the row disappears instantly; the server catches up.
  const [visible, removeLocal] = useOptimistic(rows, (cur, id: string) => cur.filter((r) => r.id !== id));

  const shown = useRef(false);
  useEffect(() => {
    if (saved && !shown.current) {
      shown.current = true;
      toast({ message: "Trade saved" });
      router.replace("/journal", { scroll: false });
    }
  }, [saved, toast, router]);

  const onDelete = (row: Row) => {
    setConfirm(null);
    start(async () => {
      removeLocal(row.id);
      await deleteTrade(row.id);
      router.refresh();
      toast({ message: `${row.symbol} trade deleted`, action: { label: "Undo", run: () => start(async () => { await restoreTrade(row.id); router.refresh(); }) } });
    });
  };

  return (
    <>
      {rows.some((r) => r.isDemo) ? (
        <p className="rounded-lg bg-citron-50 px-4 py-3 text-sm text-citron-900">
          This is a sample journal. It disappears as soon as you log your first real trade.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-fg-3">
            <tr>
              {["Date", "Market", "Side", "Plan", "Grade", "R", "P&L", ""].map((h, i) => (
                <th key={i} scope="col" className={`px-4 py-3 font-medium ${i >= 5 && i < 7 ? "text-right" : ""}`}>{h || <span className="sr-only">Actions</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {visible.map((r) => (
                <motion.tr key={r.id} layout exit={{ opacity: 0, x: -12, transition: { duration: 0.18 } }} className="group relative border-b border-line-subtle last:border-0 hover:bg-[var(--row-hover)]">
                  <td className="num whitespace-nowrap px-4 py-3 text-fg-2">{new Date(r.openedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-3"><Link href={`/trades/${r.id}`} className="font-semibold underline-offset-4 after:absolute after:inset-0 hover:underline">{r.symbol}</Link> <span className="text-xs text-fg-3">{r.exchange}</span></td>
                  <td className="px-4 py-3">{r.side === "long" ? "Buy" : "Sell"}</td>
                  <td className="px-4 py-3 text-fg-2">{r.strategy ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.grade ? <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${GRADE_CLS[r.grade]}`}>{GRADE_LABEL[r.grade]}</span>
                      : <span className="rounded-full bg-citron-100 px-2.5 py-1 text-xs font-semibold text-citron-900">{r.status === "open" ? "Open" : "Needs grade"}</span>}
                  </td>
                  <td className="num px-4 py-3 text-right">{r.r === null ? "—" : `${r.r > 0 ? "+" : ""}${r.r}R`}</td>
                  <td className={`num px-4 py-3 text-right font-semibold ${r.pnl === null ? "" : r.pnl >= 0 ? "text-profit" : "text-loss"}`}>{r.pnl === null ? "—" : money(r.pnl, r.currency, { sign: true })}</td>
                  <td className="px-2 py-3 text-right">
                    <button type="button" onClick={() => setConfirm(r)} aria-label={`Delete ${r.symbol} trade`}
                      className="relative z-10 flex size-9 items-center justify-center rounded-md text-fg-3 opacity-0 transition-opacity hover:bg-loss-subtle hover:text-loss focus-visible:opacity-100 group-hover:opacity-100">
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {confirm ? (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirm(null)} />
            <motion.div role="alertdialog" aria-modal="true" aria-labelledby="del-h"
              initial={{ y: 12, scale: 0.97 }} animate={{ y: 0, scale: 1, transition: { type: "spring", stiffness: 450, damping: 32 } }}
              className="relative flex w-full max-w-[400px] flex-col gap-4 rounded-xl border border-line bg-card p-6">
              <h2 id="del-h" className="text-lg font-bold">Delete this {confirm.symbol} trade?</h2>
              <p className="text-[15px] text-fg-2">It leaves your stats and calendar. You can undo for a few seconds after.</p>
              <div className="flex justify-end gap-2">
                <button type="button" autoFocus onClick={() => setConfirm(null)} className="h-11 rounded-md border border-line px-4 text-sm font-semibold">Keep trade</button>
                <button type="button" onClick={() => onDelete(confirm)} className="h-11 rounded-md bg-loss px-4 text-sm font-semibold text-white">Delete trade</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
