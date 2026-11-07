/** Ledger mark: a citron disc, half light — process (light) beside outcome (citron). */
export function LedgerMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden className={className}>
      <circle cx="15" cy="15" r="13" fill="#e4e33a" />
      <path d="M15 2a13 13 0 0 0 0 26z" fill="#e7e7e7" />
    </svg>
  );
}
