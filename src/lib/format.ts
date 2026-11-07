/** Money in the account's currency. INR uses Indian digit grouping (₹4,82,100). */
export function money(n: number, currency: string, opts: { sign?: boolean; decimals?: number } = {}) {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const s = new Intl.NumberFormat(locale, {
    style: "currency", currency, minimumFractionDigits: opts.decimals ?? 2, maximumFractionDigits: opts.decimals ?? 2,
  }).format(Math.abs(n));
  if (!opts.sign) return n < 0 ? `−${s}` : s;
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

export const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;
export const signed = (n: number, d = 2) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d);

/** SVG path for a sparkline/equity curve in a w×h box. */
export function linePath(values: number[], w: number, h: number, pad = 6) {
  if (values.length < 2) return `M0 ${h / 2} L${w} ${h / 2}`;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}
