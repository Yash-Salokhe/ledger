import { Suspense } from "react";
import { Search } from "lucide-react";
import { requireSession } from "@/lib/session";
import { ensureProfile } from "@/lib/data/bootstrap";
import { getTradeGate } from "@/lib/data/gate";
import { Sidebar } from "@/components/app/sidebar";
import { NewTradeButton } from "@/components/app/new-trade-button";
import { UserMenu } from "@/components/app/user-menu";

/**
 * The shell (sidebar, search, page headings) is static and prerendered, so every
 * navigation paints instantly. Only session-dependent pieces stream in behind
 * <Suspense> — the layout itself never awaits the session.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-page md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-end gap-3 px-6 pt-6 md:px-10">
          <button type="button" className="flex h-10 w-full max-w-[280px] items-center gap-2 rounded-md border border-line bg-card px-3 text-sm text-fg-3 hover:border-line-hover">
            <Search size={16} aria-hidden />
            <span className="flex-1 text-left">Search trades, plans, pages</span>
            <kbd className="rounded border border-line px-1.5 text-[11px]">⌘K</kbd>
          </button>
          <Suspense fallback={<HeaderSkeleton />}>
            <HeaderActions />
          </Suspense>
        </header>
        <main className="flex-1 px-6 pb-12 pt-2 md:px-10">{children}</main>
      </div>
    </div>
  );
}

async function HeaderActions() {
  const { user } = await requireSession();
  await ensureProfile(user.id);
  const gate = await getTradeGate(user.id);
  return (
    <>
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
