"use client";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { motion } from "motion/react";

export function Field({
  label, error, hint, trailing, ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode; trailing?: ReactNode }) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {trailing}
      </div>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errId : undefined}
        {...input}
        className={`h-12 w-full rounded-md border bg-card px-3.5 text-[15px] font-medium text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-placeholder focus:border-citron-700 focus:shadow-[0_0_0_4px_rgba(228,227,58,0.35)] ${error ? "border-loss" : "border-line"} ${input.className ?? ""}`}
      />
      {error ? <p id={errId} role="alert" className="text-[13px] text-loss">{error}</p> : hint}
    </div>
  );
}

/** 0–4: length ≥ 12, mixed case, digit, symbol. Under 8 characters caps at 1. */
export function passwordScore(p: string) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return p.length < 8 ? Math.min(s, 1) : s;
}

const STRENGTH = ["Use 12 or more characters", "Weak. Add length and mixed case", "Okay. Add a number or symbol", "Strong", "Very strong"];
const BAR = ["var(--loss-text)", "var(--lucky)", "var(--citron-700)", "var(--profit-text)"];

export function PasswordField({
  label = "Password", value, onChange, error, showStrength, autoComplete, trailing,
}: {
  label?: string; value: string; onChange: (v: string) => void; error?: string;
  showStrength?: boolean; autoComplete: "current-password" | "new-password"; trailing?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const score = passwordScore(value);
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {trailing}
      </div>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          className={`h-12 w-full rounded-md border bg-card pl-3.5 pr-13 text-[15px] font-medium text-fg outline-none transition-[border-color,box-shadow] duration-150 focus:border-citron-700 focus:shadow-[0_0_0_4px_rgba(228,227,58,0.35)] ${error ? "border-loss" : "border-line"}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-[10px] text-fg-3 hover:text-fg"
        >
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {error ? <p role="alert" className="text-[13px] text-loss">{error}</p> : null}
      {showStrength ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-4 gap-1.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-1 rounded transition-colors duration-300"
                style={{ background: i < score ? BAR[Math.max(score - 1, 0)] : "var(--border-default)" }} />
            ))}
          </div>
          <p aria-live="polite" className="text-[13px] text-fg-3">{STRENGTH[score]}</p>
        </div>
      ) : null}
    </div>
  );
}

export function SubmitButton({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <motion.button
      type="submit"
      disabled={loading}
      whileTap={{ scale: 0.98 }}
      className="mt-1 flex h-12 w-full items-center justify-center gap-2.5 rounded-md bg-citron text-[15px] font-semibold text-[#141413] transition-[filter] hover:brightness-[0.97] disabled:cursor-progress"
    >
      {loading ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
      {children}
    </motion.button>
  );
}

export function SecondaryButton({ onClick, children, loading, className = "" }: { onClick: () => void; children: ReactNode; loading?: boolean; className?: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={loading}
      whileTap={{ scale: 0.98 }}
      className={`flex h-12 items-center justify-center gap-2.5 rounded-md border border-line bg-card text-[15px] font-semibold text-fg transition-colors hover:border-line-hover ${className}`}
    >
      {loading ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
      {children}
    </motion.button>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-fg-3">
      <span className="h-px flex-1 bg-line" />{children}<span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-md bg-loss-subtle px-3.5 py-3 text-sm text-loss">{message}</p>;
}
