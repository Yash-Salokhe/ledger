import { AuthTabs } from "@/components/auth/auth-tabs";

/** Shared by Sign in and Create account so the tab pill slides instead of remounting. */
export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthTabs />
      {children}
    </>
  );
}
