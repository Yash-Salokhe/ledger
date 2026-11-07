import { BrandPanel } from "@/components/auth/brand-panel";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-page md:flex-row">
      <div className="md:w-1/2 md:min-w-[520px]">
        <div className="md:sticky md:top-0 md:h-dvh"><BrandPanel /></div>
      </div>
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          {children}
          <p className="text-xs leading-relaxed text-fg-3">
            Protected by rate limiting and breached-password checks.{" "}
            <a href="/privacy" className="underline underline-offset-2">Privacy</a>{" "}
            <a href="/terms" className="underline underline-offset-2">Terms</a>
          </p>
        </div>
      </main>
    </div>
  );
}
