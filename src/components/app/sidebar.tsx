"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { BookOpen, CalendarDays, ClipboardCheck, LayoutGrid, LineChart, NotebookTabs, Settings } from "lucide-react";
import { LedgerMark } from "@/components/ledger-mark";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/performance", label: "Performance", icon: LineChart },
  { href: "/weekly-review", label: "Weekly review", icon: ClipboardCheck },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/playbook", label: "Playbook", icon: NotebookTabs },
];

export function Sidebar({ ungraded = 0 }: { ungraded?: number }) {
  return (
    <nav aria-label="Main" className="hidden flex-col gap-1 bg-nav px-3 py-5 text-nav-fg md:sticky md:top-0 md:flex md:h-dvh md:w-[232px] md:flex-none">
      <Link href="/dashboard" className="mb-5 flex items-center gap-2.5 px-2.5">
        <LedgerMark size={26} />
        <span className="flex flex-col leading-tight">
          <span className="text-lg font-bold tracking-[-0.02em] text-white">Ledger</span>
          <span className="text-[11px] text-nav-muted">Process &gt; P&amp;L</span>
        </span>
      </Link>

      {/* The URL is request data on dynamic routes: the plain list paints in the shell, the active pill hydrates in. */}
      <Suspense fallback={<NavList path={null} ungraded={ungraded} />}>
        <ActiveNav ungraded={ungraded} />
      </Suspense>

      <div className="mt-auto flex flex-col gap-2">
        <Link href="/settings" className="flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-sm text-nav-muted hover:text-nav-fg">
          <Settings size={17} aria-hidden /> Settings
        </Link>
        <ThemeToggle />
      </div>
    </nav>
  );
}

function ActiveNav({ ungraded }: { ungraded: number }) {
  return <NavList path={usePathname()} ungraded={ungraded} />;
}

function NavList({ path, ungraded }: { path: string | null; ungraded: number }) {
  return (
        <ul className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path?.startsWith(href) ?? false;
            return (
              <li key={href} className="relative">
                {active ? (
                  <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[10px] bg-nav-active" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
                ) : null}
                <Link href={href} aria-current={active ? "page" : undefined}
                  className={`relative flex h-10 items-center gap-3 whitespace-nowrap rounded-[10px] px-2.5 text-sm transition-colors ${active ? "text-white" : "text-nav-muted hover:text-nav-fg"}`}>
                  <Icon size={17} aria-hidden />
                  <span className="flex-1">{label}</span>
                  {label === "Journal" && ungraded > 0 ? (
                    <span className="num rounded-full bg-citron px-1.5 text-[11px] font-bold text-[#141413]" aria-label={`${ungraded} trades need a grade`}>{ungraded}</span>
                  ) : active ? <span className="size-1.5 rounded-full bg-citron" aria-hidden /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
  );
}
