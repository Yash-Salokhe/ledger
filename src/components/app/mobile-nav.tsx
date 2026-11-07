"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, CalendarDays, ClipboardCheck, LayoutGrid, LineChart, Menu, NotebookTabs, Settings, X } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

const TABS = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/performance", label: "Stats", icon: LineChart },
];
const MORE = [
  { href: "/weekly-review", label: "Weekly review", icon: ClipboardCheck },
  { href: "/playbook", label: "Playbook", icon: NotebookTabs },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Phone navigation: a bottom tab bar (4 tabs + More), thumb-reachable, above the safe area. */
export function MobileNav() {
  return (
    <Suspense fallback={<Bar path={null} />}>
      <Active />
    </Suspense>
  );
}

function Active() {
  return <Bar path={usePathname()} />;
}

function Bar({ path }: { path: string | null }) {
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some((m) => path?.startsWith(m.href));
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-nav pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = path?.startsWith(href) ?? false;
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined}
                  className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-white" : "text-nav-muted"}`}>
                  {active ? <motion.span layoutId="tab-dot" className="absolute top-1.5 h-1 w-6 rounded-full bg-citron" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
                  <Icon size={20} aria-hidden />{label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-haspopup="dialog"
              className={`relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${moreActive ? "text-white" : "text-nav-muted"}`}>
              {moreActive ? <span className="absolute top-1.5 h-1 w-6 rounded-full bg-citron" /> : null}
              <Menu size={20} aria-hidden />More
            </button>
          </li>
        </ul>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <motion.div role="dialog" aria-modal="true" aria-label="More"
              initial={{ y: "100%" }} animate={{ y: 0, transition: { type: "spring", stiffness: 420, damping: 38 } }} exit={{ y: "100%", transition: { duration: 0.18 } }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => { if (i.offset.y > 80) setOpen(false); }}
              className="absolute inset-x-0 bottom-0 flex flex-col gap-2 rounded-t-[24px] bg-nav px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3 text-nav-fg">
              <span className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/20" aria-hidden />
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-sm font-semibold text-white">More</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex size-10 items-center justify-center rounded-full text-nav-muted hover:text-white"><X size={18} /></button>
              </div>
              {MORE.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={path?.startsWith(href) ? "page" : undefined}
                  className="flex h-12 items-center gap-3 rounded-[12px] px-3 text-[15px] hover:bg-nav-active aria-[current=page]:bg-nav-active aria-[current=page]:text-white">
                  <Icon size={18} aria-hidden />{label}
                </Link>
              ))}
              <div className="mt-2"><ThemeToggle /></div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
