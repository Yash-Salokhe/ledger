"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";

export function UserMenu({ name, detail }: { name: string; detail: string }) {
  const router = useRouter();
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-subtle text-xs font-bold">{initials}</span>
      <span className="hidden flex-col leading-tight lg:flex">
        <span className="text-sm font-semibold">{name}</span>
        <span className="text-xs text-fg-3">{detail}</span>
      </span>
      <button type="button" aria-label="Sign out" title="Sign out"
        onClick={async () => { await signOut(); router.push("/sign-in"); }}
        className="flex size-9 items-center justify-center rounded-md text-fg-3 hover:bg-subtle hover:text-fg">
        <LogOut size={16} aria-hidden />
      </button>
    </div>
  );
}
