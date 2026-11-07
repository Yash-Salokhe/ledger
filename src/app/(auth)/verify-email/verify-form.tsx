"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { motion } from "motion/react";
import { authClient } from "@/lib/auth-client";
import { useQueryParam } from "@/lib/use-query-param";

/** Verification is required before first use (product decision). 6-digit code, 10-minute expiry. */
export function VerifyForm() {
  const router = useRouter();
  const emailParam = useQueryParam("email");
  const email = emailParam ?? "";
  useEffect(() => {
    if (emailParam === null) router.replace("/sign-up"); // null = loaded in the browser and missing
  }, [emailParam, router]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function verify(otp: string) {
    setChecking(true);
    setError(undefined);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    setChecking(false);
    if (!error) return router.push("/dashboard?tour=1");
    setCode("");
    if (error.code === "OTP_EXPIRED") setError("That code expired. Send a new one below.");
    else if (error.code === "TOO_MANY_ATTEMPTS") setError("Too many wrong codes. Send a new one below.");
    else setError("That code isn't right. Check the latest email from Ledger.");
  }

  async function resend() {
    setResendIn(30);
    await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5">
      <div className="flex size-14 items-center justify-center rounded-lg bg-citron text-[#141413]"><Mail size={26} aria-hidden /></div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[32px] font-bold tracking-[-0.025em]">Verify your email</h1>
        <p className="text-[15px] leading-relaxed text-fg-3">
          We sent a 6-digit code to <strong className="text-fg">{email || "your inbox"}</strong>. Enter it to open your journal.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="otp" className="text-sm font-semibold">Verification code</label>
        <input
          ref={input}
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          disabled={checking}
          aria-invalid={Boolean(error)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(v);
            if (v.length === 6) void verify(v);
          }}
          className={`num h-[60px] w-full rounded-md border bg-card pl-[0.5em] text-center text-[28px] tracking-[0.5em] outline-none focus:border-citron-700 focus:shadow-[0_0_0_4px_rgba(228,227,58,0.35)] ${error ? "border-loss" : "border-line"}`}
        />
        {error ? <p role="alert" className="text-[13px] text-loss">{error}</p> : null}
        {checking ? <p className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" aria-hidden />Checking code</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-fg-3">
        <span>No email?</span>
        <button type="button" onClick={resend} disabled={resendIn > 0} className="font-semibold text-fg underline underline-offset-4 disabled:text-fg-3 disabled:no-underline">
          {resendIn > 0 ? <span className="num">Resend in {resendIn}s</span> : "Resend code"}
        </button>
        <Link href="/sign-up" className="underline underline-offset-4">Change email</Link>
      </div>
    </motion.div>
  );
}
