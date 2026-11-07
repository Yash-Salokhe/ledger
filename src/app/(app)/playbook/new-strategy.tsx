"use client";
import { useActionState, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createStrategy } from "@/lib/actions/playbook";

export function NewStrategy() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createStrategy, undefined);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-md bg-fg px-4 text-sm font-semibold text-page">
        <Plus size={16} aria-hidden /> New strategy
      </button>
    );
  }
  return (
    <form action={action} className="flex items-start gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="sname" className="sr-only">Strategy name</label>
        <input id="sname" name="name" autoFocus required placeholder="e.g. Opening range breakout" maxLength={80}
          className="h-10 w-[260px] rounded-md border border-line bg-card px-3 text-sm outline-none focus:border-citron-700" />
        {state?.error ? <p role="alert" className="text-xs text-loss">{state.error}</p> : null}
      </div>
      <button type="submit" disabled={pending} className="flex h-10 items-center gap-2 rounded-md bg-fg px-4 text-sm font-semibold text-page">
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}Create
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-md px-3 text-sm font-semibold">Cancel</button>
    </form>
  );
}
