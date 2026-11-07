"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { Field, PasswordField, SubmitButton, Divider, FormError, passwordScore } from "@/components/auth/fields";
import { SocialButtons, type Providers } from "@/components/auth/social";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Errors = { name?: string; email?: string; password?: string; terms?: string; form?: string };

export function SignUpForm({ providers }: { providers: Providers }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (!name.trim()) errs.name = "Enter your name.";
    if (!EMAIL.test(email)) errs.email = email ? "That email doesn't look complete. Check for a missing @ or domain." : "Enter your email.";
    if (passwordScore(password) < 3 || password.length < 12) errs.password = "Use at least 12 characters with mixed case and a number.";
    if (!agreed) errs.terms = "Accept the terms to create your account.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const { error } = await signUp.email({ name: name.trim(), email, password });
    setLoading(false);
    if (!error) return router.push(`/verify-email?email=${encodeURIComponent(email)}`);

    if (error.code === "USER_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")
      return setErrors({ email: "An account already uses this email. Sign in instead." });
    if (error.code === "PASSWORD_COMPROMISED") return setErrors({ password: error.message });
    if (error.status === 429) return setErrors({ form: "Too many attempts. Wait a minute, then try again." });
    setErrors({ form: "We couldn't create your account. Try again in a moment." });
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[32px] font-bold tracking-[-0.025em]">Start your journal</h1>
        <p className="text-[15px] text-fg-3">Free while Ledger is in early access.</p>
      </div>

      <SocialButtons providers={providers} next="/dashboard?tour=1" />
      {providers.google || providers.apple ? <Divider>or with email</Divider> : null}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={errors.form} />
        <Field label="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Field label="Email" type="email" inputMode="email" autoComplete="email" value={email}
          onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} error={errors.email} />
        <PasswordField autoComplete="new-password" value={password} showStrength
          onChange={(v) => { setPassword(v); setErrors((x) => ({ ...x, password: undefined })); }} error={errors.password} />

        <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-fg-3">
          <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setErrors((x) => ({ ...x, terms: undefined })); }}
            className="mt-0.5 size-[18px] accent-[#141413]" />
          <span>
            I agree to the <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy policy</a>.
            Ledger is a journal, not a broker or advisor.
          </span>
        </label>
        {errors.terms ? <p role="alert" className="-mt-2 text-[13px] text-loss">{errors.terms}</p> : null}

        <SubmitButton loading={loading}>{loading ? "Creating account" : "Create account"}</SubmitButton>
      </form>
    </>
  );
}
