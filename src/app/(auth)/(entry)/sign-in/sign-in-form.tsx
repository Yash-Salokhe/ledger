"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, signIn } from "@/lib/auth-client";
import { Field, PasswordField, SubmitButton, Divider, FormError } from "@/components/auth/fields";
import { SocialButtons, PasskeyButton, type Providers } from "@/components/auth/social";
import { safeNext } from "@/lib/redirect";
import { useQueryParam } from "@/lib/use-query-param";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function SignInForm({ providers }: { providers: Providers }) {
  const router = useRouter();
  const next = safeNext(useQueryParam("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  // Passkey autofill: browsers offer saved passkeys right in the email field.
  useEffect(() => {
    if (typeof window === "undefined" || !window.PublicKeyCredential?.isConditionalMediationAvailable) return;
    window.PublicKeyCredential.isConditionalMediationAvailable().then((ok) => {
      if (ok) void signIn.passkey({ autoFill: true, fetchOptions: { onSuccess: () => router.push(next) } });
    });
  }, [next, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!EMAIL.test(email)) errs.email = email ? "That email doesn't look complete. Check for a missing @ or domain." : "Enter your email.";
    if (!password) errs.password = "Enter your password.";
    setErrors(errs);
    if (errs.email || errs.password) return;

    setLoading(true);
    const { error } = await signIn.email({ email, password, callbackURL: next });
    setLoading(false);
    if (!error) return router.push(next);
    if (error.code === "EMAIL_NOT_VERIFIED") {
      await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
      return router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    }
    if (error.status === 429) return setErrors({ form: "Too many attempts. Wait a minute, then try again." });
    setErrors({ form: "That email and password don't match. Check both, or reset your password." });
  }

  async function sendMagicLink() {
    if (!EMAIL.test(email)) return setErrors({ email: "Enter your email above and we'll send the link there." });
    setLoading(true);
    const { error } = await signIn.magicLink({ email, callbackURL: next, newUserCallbackURL: "/dashboard?tour=1" });
    setLoading(false);
    if (error) return setErrors({ form: "We couldn't send the link. Try again in a minute." });
    setMagicSent(true);
  }

  if (magicSent) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-[32px] font-bold tracking-[-0.025em]">Check your inbox</h1>
        <p className="text-[15px] leading-relaxed text-fg-3">
          We sent a sign-in link to <strong className="text-fg">{email}</strong>. It works once and expires in 30 minutes.
        </p>
        <button type="button" onClick={() => setMagicSent(false)} className="mt-4 self-start text-sm font-semibold underline underline-offset-4">
          Use a password instead
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[32px] font-bold tracking-[-0.025em]">Welcome back</h1>
        <p className="text-[15px] text-fg-3">Sign in to review today&rsquo;s trades.</p>
      </div>

      <SocialButtons providers={providers} next={next} />
      <PasskeyButton onSuccess={() => router.push(next)} onError={(m) => setErrors({ form: m })} />
      <Divider>or with email</Divider>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={errors.form} />
        <Field label="Email" type="email" inputMode="email" autoComplete="username webauthn" value={email}
          onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined })); }} error={errors.email} />
        <PasswordField autoComplete="current-password" value={password}
          onChange={(v) => { setPassword(v); setErrors((x) => ({ ...x, password: undefined })); }} error={errors.password}
          trailing={<Link href="/forgot-password" className="text-[13px] font-semibold text-fg-3 underline underline-offset-4">Forgot password?</Link>} />
        <SubmitButton loading={loading}>{loading ? "Signing in" : "Sign in"}</SubmitButton>
      </form>

      <button type="button" onClick={sendMagicLink} className="self-center text-sm font-semibold underline underline-offset-4">
        Email me a sign-in link instead
      </button>
    </>
  );
}
