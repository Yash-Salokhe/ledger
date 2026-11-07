import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { ensureProfile } from "@/lib/data/bootstrap";
import { getTradeGate } from "@/lib/data/gate";
import { Sidebar } from "@/components/app/sidebar";
import { NewTradeButton } from "@/components/app/new-trade-button";
import { UserMenu } from "@/components/app/user-menu";
import { ToastProvider } from "@/components/app/toast";
import { MobileNav } from "@/components/app/mobile-nav";
import { CommandPalette } from "@/components/app/command-palette";
import { SearchButton } from "@/components/app/search-button";
import { Tour } from "@/components/app/tour";
import { getTourSeen } from "@/lib/data/bootstrap";
import { LedgerMark } from "@/components/ledger-mark";
import Link from "next/link";

/**
 * The shell (sidebar, search, page headings) is static and prerendered, so every
 * navigation paints instantly. Only session-dependent pieces stream in behind
 * <Suspense> — the layout itself never awaits the session.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
    <div className="flex min-h-dvh flex-col bg-page md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 px-4 pt-4 md:px-10 md:pt-6">
          <Link href="/dashboard" aria-label="Ledger home" className="mr-auto md:hidden"><LedgerMark size={28} /></Link>
          <SearchButton />
          <Suspense fallback={<HeaderSkeleton />}>
            <HeaderActions />
          </Suspense>
        </header>
        <main className="flex-1 px-4 pb-28 pt-2 md:px-10 md:pb-12">{children}</main>
      </div>
      <MobileNav />
      <CommandPalette />
    </div>
    </ToastProvider>
  );
}

async function HeaderActions() {
  const { user } = await requireSession();
  await ensureProfile(user.id);
  const [gate, tourSeen] = await Promise.all([getTradeGate(user.id), getTourSeen(user.id)]);
  return (
    <>
      <Tour seen={tourSeen} />
      <NewTradeButton canTrade={gate.canTrade} lockReason={gate.lockReason} findings={gate.findings} />
      <UserMenu name={user.name} detail={user.email} />
    </>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-10 w-[124px] animate-pulse rounded-md bg-subtle" />
      <span className="size-9 animate-pulse rounded-full bg-subtle" />
    </div>
  );
}
