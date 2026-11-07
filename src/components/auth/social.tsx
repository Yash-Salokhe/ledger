"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { SecondaryButton } from "./fields";

export type Providers = { google: boolean; apple: boolean };

const Google = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.7 3.3-7.9z" />
    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
  </svg>
);
const Apple = () => (
  <svg width="17" height="18" viewBox="0 0 17 20" aria-hidden>
    <path fill="currentColor" d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9s-2-.9-3.4-.9A5 5 0 0 0 1 7.3c-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.5 1.3 0 1.7-.8 3.3-.8s2 .8 3.4.8 2.2-1.2 3-2.5c1-1.4 1.3-2.7 1.4-2.8-.1 0-2.7-1-2.7-4.1zM11.6 3.2A4.6 4.6 0 0 0 12.7 0a4.7 4.7 0 0 0-3.1 1.6 4.4 4.4 0 0 0-1.1 3.1c1.2.1 2.4-.6 3.1-1.5z" />
  </svg>
);

export function SocialButtons({ providers, next }: { providers: Providers; next: string }) {
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const go = async (provider: "google" | "apple") => {
    setBusy(provider);
    await signIn.social({ provider, callbackURL: next, newUserCallbackURL: "/dashboard?tour=1" });
  };
  if (!providers.google && !providers.apple) return null;
  return (
    <div className={`grid gap-3 ${providers.google && providers.apple ? "grid-cols-2" : "grid-cols-1"}`}>
      {providers.google ? <SecondaryButton onClick={() => go("google")} loading={busy === "google"}><Google /> Google</SecondaryButton> : null}
      {providers.apple ? <SecondaryButton onClick={() => go("apple")} loading={busy === "apple"}><Apple /> Apple</SecondaryButton> : null}
    </div>
  );
}

export function PasskeyButton({ onSuccess, onError }: { onSuccess: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <SecondaryButton
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const res = await signIn.passkey();
        setBusy(false);
        if (res?.error) onError("That passkey didn't work. Try again, or sign in with email.");
        else onSuccess();
      }}
      className="w-full"
    >
      {busy ? null : <KeyRound size={18} aria-hidden />} Sign in with a passkey
    </SecondaryButton>
  );
}
