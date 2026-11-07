"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

/** Sign in / Create account switch. The pill slides with a spring (shared layoutId). */
export function AuthTabs() {
  const active = usePathname().startsWith("/sign-up") ? "sign-up" : "sign-in";
  const q = "";
  const tabs = [
    { id: "sign-in", label: "Sign in", href: `/sign-in${q}` },
    { id: "sign-up", label: "Create account", href: `/sign-up${q}` },
  ] as const;
  return (
    <nav aria-label="Sign in or create account" className="relative flex rounded-[14px] bg-subtle p-1">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={active === t.id ? "page" : undefined}
          className="relative z-10 flex h-10 flex-1 items-center justify-center rounded-[10px] text-sm font-semibold text-fg"
        >
          {active === t.id ? (
            <motion.span
              layoutId="auth-tab"
              className="absolute inset-0 -z-10 rounded-[10px] bg-card shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
            />
          ) : null}
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
