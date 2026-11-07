"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, CornerDownLeft, FileUp, LayoutGrid, LineChart, Loader2, NotebookTabs, Plus, Search, Settings } from "lucide-react";
import { searchAll, type SearchHit } from "@/lib/actions/search";
import { money } from "@/lib/format";

const PAGES = [
  { title: "New trade", href: "/trades/new", icon: Plus, keywords: "log add create" },
  { title: "Dashboard", href: "/dashboard", icon: LayoutGrid, keywords: "home balance" },
  { title: "Journal", href: "/journal", icon: BookOpen, keywords: "trades list" },
  { title: "Performance", href: "/performance", icon: LineChart, keywords: "stats analytics r distribution" },
  { title: "Weekly review", href: "/weekly-review", icon: ClipboardCheck, keywords: "reflection" },
  { title: "Calendar", href: "/calendar", icon: CalendarDays, keywords: "days month" },
  { title: "Playbook", href: "/playbook", icon: NotebookTabs, keywords: "strategies setups checklist" },
  { title: "Import trades", href: "/import", icon: FileUp, keywords: "csv mt5 zerodha upload" },
  { title: "Settings", href: "/settings", icon: Settings, keywords: "rules limits account export delete theme" },
];

type Item = { key: string; title: string; detail?: string; href: string; icon?: typeof Search; pnl?: number | null; currency?: string; group: string };

/** ⌘K / Ctrl+K palette (Figma 13). Opens from the header search too. Arrow keys + Enter, Esc closes. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ledger:search", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("ledger:search", onOpen); };
  }, []);

  const close = () => { setOpen(false); setQ(""); setHits([]); setActive(0); };

  const items = useMemo<Item[]>(() => {
    const ql = q.trim().toLowerCase();
    const pages = PAGES.filter((p) => !ql || `${p.title} ${p.keywords}`.toLowerCase().includes(ql))
      .map((p) => ({ key: p.href, title: p.title, href: p.href, icon: p.icon, group: "Go to" }));
    const found = hits.map((h) => ({
      key: `${h.kind}:${h.id}`, title: h.title, detail: h.detail, href: h.href, group: h.kind === "trade" ? "Trades" : "Strategies",
      icon: h.kind === "trade" ? BookOpen : NotebookTabs, pnl: h.kind === "trade" ? h.pnl : undefined, currency: h.kind === "trade" ? h.currency : undefined,
    }));
    return [...found, ...pages].slice(0, 14);
  }, [q, hits]);

  const go = (it: Item | undefined) => { if (!it) return; close(); router.push(it.href); };

  const onChange = (v: string) => {
    setQ(v); setActive(0);
    clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(() => start(async () => setHits(await searchAll(v))), 160);
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={close} />
          <motion.div role="dialog" aria-modal="true" aria-label="Search"
            initial={{ y: -8, scale: 0.98 }} animate={{ y: 0, scale: 1, transition: { type: "spring", stiffness: 500, damping: 36 } }}
            onAnimationComplete={() => input.current?.focus()}
            className="relative flex max-h-[70vh] w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]">
            <div className="flex items-center gap-3 border-b border-line px-4">
              {pending ? <Loader2 size={18} className="animate-spin text-fg-3" aria-hidden /> : <Search size={18} className="text-fg-3" aria-hidden />}
              <input ref={input} value={q} onChange={(e) => onChange(e.target.value)} autoFocus
                role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={items[active] ? `cmdk-${active}` : undefined} aria-label="Search trades, plans and pages"
                placeholder="Search trades, plans, pages"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                  else if (e.key === "Enter") { e.preventDefault(); go(items[active]); }
                  else if (e.key === "Escape") { e.preventDefault(); close(); }
                }}
                className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-placeholder focus-visible:outline-none" />
              <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] text-fg-3">Esc</kbd>
            </div>
            <ul id="cmdk-list" role="listbox" className="overflow-y-auto p-2">
              {items.length === 0 ? <li className="px-3 py-8 text-center text-sm text-fg-3">No trades, plans or pages match &ldquo;{q}&rdquo;.</li> : null}
              {items.map((it, i) => {
                const header = it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                const Icon = it.icon ?? Search;
                return (
                  <li key={it.key} role="presentation">
                    {header ? <p className="px-3 pb-1 pt-3 text-xs font-medium text-fg-3">{header}</p> : null}
                    <div id={`cmdk-${i}`} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={() => go(it)}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ${i === active ? "bg-subtle" : ""}`}>
                      <Icon size={16} className="flex-none text-fg-3" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{it.title}</span>
                        {it.detail ? <span className="block truncate text-xs text-fg-3">{it.detail}</span> : null}
                      </span>
                      {it.pnl !== undefined && it.pnl !== null && it.currency ? (
                        <span className={`num text-sm font-semibold ${it.pnl >= 0 ? "text-profit" : "text-loss"}`}>{money(it.pnl, it.currency, { sign: true })}</span>
                      ) : null}
                      {i === active ? <CornerDownLeft size={14} className="text-fg-3" aria-hidden /> : <ArrowRight size={14} className="text-transparent" aria-hidden />}
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Opens the palette from anywhere (header button, mobile icon). */
export function openSearch() {
  window.dispatchEvent(new Event("ledger:search"));
}
