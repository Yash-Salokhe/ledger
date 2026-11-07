"use client";
import { useId, useState } from "react";
import { useWidth } from "./use-width";

/**
 * Column chart following the dataviz mark specs: bars ≤ 24px, 4px rounded data-end and
 * square at the zero baseline, recessive hairline grid, hover/focus tooltip on a full-band
 * hit target, selective labels (extremes only), and an always-available table view.
 * Diverging mode colours by sign with the validated --chart-profit / --chart-loss tokens.
 */
export type Column = { key: string | number; label: string; value: number; display: string; detail?: string; color?: string };

const nice = (max: number) => {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max)), f = max / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
};
const tick = (n: number) => (Math.abs(n) >= 1e5 ? `${(n / 1e3).toFixed(0)}K` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));

export function Columns({ title, data, diverging = false, height = 200, unit = "", caption }: {
  title: string; data: Column[]; diverging?: boolean; height?: number; unit?: string; caption?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const [box, W] = useWidth<HTMLDivElement>();
  const padL = 44, padR = 8, padT = 22, padB = 28;
  const plotW = W - padL - padR, plotH = height - padT - padB;
  const maxPos = Math.max(0, ...data.map((d) => d.value)), minNeg = Math.min(0, ...data.map((d) => d.value));
  const top = nice(maxPos), bottom = minNeg < 0 ? -nice(-minNeg) : 0;
  const span = top - bottom || 1;
  const y = (v: number) => padT + ((top - v) / span) * plotH;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.6);
  const ticks = bottom < 0 ? [bottom, 0, top] : [0, top / 2, top];
  const extremes = new Set([data.reduce((a, d, i) => (d.value > data[a].value ? i : a), 0), data.reduce((a, d, i) => (d.value < data[a].value ? i : a), 0)]);
  const color = (d: Column) => d.color ?? (diverging ? (d.value >= 0 ? "var(--chart-profit)" : "var(--chart-loss)") : "var(--chart-line)");

  return (
    <figure className="m-0 flex flex-col gap-2" aria-labelledby={`${id}-t`}>
      <div className="flex items-center justify-between">
        <figcaption id={`${id}-t`} className="text-[15px] font-semibold">{title}</figcaption>
        <button type="button" onClick={() => setTable((t) => !t)} className="text-xs font-semibold text-fg-3 underline-offset-4 hover:underline">{table ? "Chart" : "Table"}</button>
      </div>
      {caption ? <p className="-mt-1 text-xs text-fg-3">{caption}</p> : null}

      {table ? (
        <table className="w-full text-sm">
          <tbody>{data.map((d) => <tr key={d.key} className="border-t border-line-subtle"><th scope="row" className="py-1.5 text-left font-normal text-fg-2">{d.label}</th><td className="num py-1.5 text-right font-semibold">{d.display}</td><td className="py-1.5 pl-3 text-right text-xs text-fg-3">{d.detail}</td></tr>)}</tbody>
        </table>
      ) : data.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-3">Not enough trades yet.</p>
      ) : (
        <div ref={box} className="relative">
          <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="block max-w-full" role="img" aria-label={`${title}. ${data.map((d) => `${d.label}: ${d.display}`).join("; ")}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-ref)" : "var(--chart-grid)"} strokeWidth="1" />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-tertiary)" className="num">{tick(t)}{unit}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = padL + band * i + band / 2;
              const y0 = y(0), y1 = y(d.value), h = Math.abs(y1 - y0);
              const up = d.value >= 0, r = Math.min(4, h / 2, barW / 2);
              // Rounded at the data end, square at the baseline.
              const x0 = cx - barW / 2, x1 = cx + barW / 2;
              const path = h < 0.5 ? "" : up
                ? `M${x0},${y0} V${y1 + r} Q${x0},${y1} ${x0 + r},${y1} H${x1 - r} Q${x1},${y1} ${x1},${y1 + r} V${y0} Z`
                : `M${x0},${y0} V${y1 - r} Q${x0},${y1} ${x0 + r},${y1} H${x1 - r} Q${x1},${y1} ${x1},${y1 - r} V${y0} Z`;
              return (
                <g key={d.key}>
                  <path d={path} fill={color(d)} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: "opacity 120ms" }} />
                  {extremes.has(i) && d.value !== 0 ? (
                    <text x={cx} y={up ? y1 - 6 : y1 + 14} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text-secondary)" className="num">{d.display}</text>
                  ) : null}
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-tertiary)">{d.label}</text>
                  {/* Hit target: the whole band, bigger than the mark. */}
                  <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent" tabIndex={0} role="presentation"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} className="outline-none" />
                </g>
              );
            })}
          </svg>
          {hover !== null ? (
            <div role="status" className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]"
              style={{ left: `${((padL + band * hover + band / 2) / W) * 100}%` }}>
              <span className="flex items-center gap-1.5 font-semibold"><span className="size-2 rounded-sm" style={{ background: color(data[hover]) }} />{data[hover].label}</span>
              <span className="num block text-fg">{data[hover].display}</span>
              {data[hover].detail ? <span className="block text-fg-3">{data[hover].detail}</span> : null}
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}
