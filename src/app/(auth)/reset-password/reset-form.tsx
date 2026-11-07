"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { PasswordField, SubmitButton, FormError, passwordScore } from "@/components/auth/fields";
import { useQueryParam } from "@/lib/use-query-param";

export function ResetForm() {
  const router = useRouter();
  const tokenParam = useQueryParam("token");
  const errorParam = useQueryParam("error");
  // undefined while hydrating; null when the link is missing or invalid
  const token = tokenParam === undefined ? undefined : errorParam || !tokenParam ? null : tokenParam;
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordScore(password) < 3 || password.length < 12) return setError("Use at least 12 characters with mixed case and a number.");
    setLoading(true);
    if (!token) return;
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setLoading(false);
    if (!error) return router.push("/sign-in?reset=1");
    if (error.code === "PASSWORD_COMPROMISED") return setError(error.message);
    setFormError("This link has expired. Request a new one from the sign-in page.");
  }

  if (token === null) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-[32px] font-bold tracking-[-0.025em]">This link has expired</h1>
        <p className="text-[15px] text-fg-3">Reset links work once and last 30 minutes. Request a new one.</p>
        <Link href="/forgot-password" className="mt-2 self-start text-sm font-semibold underline underline-offset-4">Send a new link</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[32px] font-bold tracking-[-0.025em]">Choose a new password</h1>
        <p className="text-[15px] text-fg-3">You&rsquo;ll be signed out on other devices.</p>
      </div>
      <FormError message={formError} />
      <PasswordField label="New password" autoComplete="new-password" value={password} showStrength
        onChange={(v) => { setPassword(v); setError(undefined); }} error={error} />
      <SubmitButton loading={loading}>Save password</SubmitButton>
    </form>
  );
}
