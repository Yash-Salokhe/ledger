"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Field, SubmitButton } from "@/components/auth/fields";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL.test(email)) return setError(email ? "That email doesn't look complete." : "Enter your email.");
    setLoading(true);
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setLoading(false);
    // Same response whether or not the account exists, so emails can't be enumerated.
    setSent(true);
  }

  return (
    <>
      <Link href="/sign-in" className="flex items-center gap-1.5 self-start text-sm font-semibold text-fg-3 hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> Back to sign in
      </Link>
      {sent ? (
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[32px] font-bold tracking-[-0.025em]">Check your inbox</h1>
          <p className="text-[15px] leading-relaxed text-fg-3">
            If an account uses <strong className="text-fg">{email}</strong>, a reset link is on its way. It expires in 30 minutes.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[32px] font-bold tracking-[-0.025em]">Reset your password</h1>
            <p className="text-[15px] text-fg-3">Enter the email on your account and we&rsquo;ll send a reset link.</p>
          </div>
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} error={error} />
          <SubmitButton loading={loading}>Send reset link</SubmitButton>
        </form>
      )}
    </>
  );
}
