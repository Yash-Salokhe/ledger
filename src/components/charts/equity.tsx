"use client";
import { useRef, useState } from "react";
import { money } from "@/lib/format";
import { useWidth } from "./use-width";

/** Balance over time: 2px line, ~10% area wash, crosshair + tooltip on hover/keyboard, end value labelled. */
export function EquityChart({ points, currency, height = 220 }: { points: { day: string | null; balance: number }[]; currency: string; height?: number }) {
  const [i, setI] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const [box, W] = useWidth<HTMLDivElement>();
  const padT = 16, padB = 12, padL = 4, padR = 4;
  if (points.length < 2) return <p className="py-12 text-center text-sm text-fg-3">Close a few trades to see your curve.</p>;
  const vals = points.map((p) => p.balance);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (k: number) => padL + (k / (points.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / span) * (height - padT - padB);
  const line = points.map((p, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${height - padB} L${x(0)},${height - padB} Z`;
  const up = vals.at(-1)! >= vals[0];
  const stroke = up ? "var(--chart-profit)" : "var(--chart-loss)";
  const p = i === null ? null : points[i];

  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const k = Math.round(((clientX - r.left) / r.width) * (points.length - 1));
    setI(Math.max(0, Math.min(points.length - 1, k)));
  };

  return (
    <div ref={box} className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="block max-w-full touch-none" tabIndex={0}
        role="img" aria-label={`Balance from ${money(vals[0], currency)} to ${money(vals.at(-1)!, currency)}. Use arrow keys to step through days.`}
        onPointerMove={(e) => pick(e.clientX)} onPointerLeave={() => setI(null)}
        onKeyDown={(e) => { if (e.key === "ArrowRight") setI((k) => Math.min(points.length - 1, (k ?? -1) + 1)); if (e.key === "ArrowLeft") setI((k) => Math.max(0, (k ?? points.length) - 1)); }}
        onBlur={() => setI(null)}>
        <line x1={0} x2={W} y1={y(vals[0])} y2={y(vals[0])} stroke="var(--chart-ref)" strokeWidth="1" />
        <path d={area} fill={stroke} opacity="0.1" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="draw-line" />
        <circle cx={x(points.length - 1)} cy={y(vals.at(-1)!)} r="4" fill={stroke} stroke="var(--surface-card)" strokeWidth="2" />
        {p ? (
          <>
            <line x1={x(i!)} x2={x(i!)} y1={padT} y2={height - padB} stroke="var(--chart-ref)" strokeWidth="1" />
            <circle cx={x(i!)} cy={y(p.balance)} r="5" fill={stroke} stroke="var(--surface-card)" strokeWidth="2" />
          </>
        ) : null}
      </svg>
      {p ? (
        <div role="status" className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)]"
          style={{ left: `${Math.min(88, Math.max(12, (x(i!) / W) * 100))}%` }}>
          <span className="block text-fg-3">{p.day ? new Date(`${p.day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "Start"}</span>
          <span className="num block font-semibold text-fg">{money(p.balance, currency)}</span>
        </div>
      ) : null}
    </div>
  );
}
