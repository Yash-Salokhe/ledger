/**
 * Performance analytics as a pure function, so it is unit-tested and runs the same
 * anywhere. Input rows are closed trades already scoped to one account and range.
 */
import type { Grade } from "@/lib/trades/math";

export type Row = {
  pnl: number;
  r: number | null;
  day: string; // YYYY-MM-DD in the user's timezone
  dow: number; // 1 = Monday … 7 = Sunday (ISO)
  hour: number; // 0–23 entry hour, user's timezone
  grade: Grade | null;
  followedPlan: boolean | null;
  side: "long" | "short";
  symbol: string;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (n: number | null, d = 2) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const GRADE_ORDER: Grade[] = ["earned", "lucky", "good_loss", "deserved"];
export const R_BINS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3] as const; // lower edges; ends are open

export function summarize(rows: Row[], openingBalance: number) {
  const pnls = rows.map((r) => r.pnl);
  const wins = pnls.filter((p) => p > 0), losses = pnls.filter((p) => p < 0);
  const rs = rows.map((r) => r.r).filter((r): r is number => r !== null);
  const grossWin = sum(wins), grossLoss = -sum(losses);

  // Equity by day and max drawdown (peak-to-trough, money and % of peak).
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.pnl);
  const days = [...byDay.keys()].sort();
  let bal = openingBalance, peak = openingBalance, maxDd = 0, maxDdPct = 0;
  const equity = [{ day: null as string | null, balance: openingBalance }];
  for (const d of days) {
    bal += byDay.get(d)!;
    equity.push({ day: d, balance: round(bal, 4)! });
    peak = Math.max(peak, bal);
    const dd = peak - bal;
    if (dd > maxDd) { maxDd = dd; maxDdPct = peak ? (dd / peak) * 100 : 0; }
  }

  // R distribution: open-ended first and last bins.
  const bins = R_BINS.map((lo, i) => ({
    lo, hi: R_BINS[i + 1] ?? null,
    label: i === 0 ? `≤ ${R_BINS[1]}` : i === R_BINS.length - 1 ? `≥ ${lo}` : `${lo} to ${R_BINS[i + 1]}`,
    count: 0,
  }));
  for (const r of rs) {
    let i = R_BINS.findIndex((lo, k) => r < (R_BINS[k + 1] ?? Infinity) && (k === 0 || r >= lo));
    if (i < 0) i = R_BINS.length - 1;
    bins[i].count++;
  }

  const group = <K extends string | number>(key: (r: Row) => K) => {
    const m = new Map<K, Row[]>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return m;
  };
  const stat = (xs: Row[]) => {
    const rr = xs.map((x) => x.r).filter((v): v is number => v !== null);
    return { trades: xs.length, pnl: round(sum(xs.map((x) => x.pnl)), 4)!, avgR: round(avg(rr)), winRate: xs.length ? round((xs.filter((x) => x.pnl > 0).length / xs.length) * 100, 1)! : 0 };
  };

  const dow = group((r) => r.dow), hour = group((r) => r.hour), grade = group((r) => r.grade ?? "ungraded"), sym = group((r) => r.symbol), side = group((r) => r.side);
  const onPlan = rows.filter((r) => r.followedPlan === true), offPlan = rows.filter((r) => r.followedPlan === false);

  return {
    trades: rows.length,
    net: round(sum(pnls), 4)!,
    winRate: rows.length ? round((wins.length / rows.length) * 100, 1)! : null,
    avgWin: round(avg(wins)), avgLoss: round(avg(losses)),
    profitFactor: grossLoss ? round(grossWin / grossLoss) : null,
    expectancyR: round(avg(rs)),
    maxDrawdown: round(maxDd, 2)!, maxDrawdownPct: round(maxDdPct, 1)!,
    equity,
    rDistribution: bins,
    byWeekday: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ key: d, ...stat(dow.get(d) ?? []) })).filter((d) => d.trades || d.key <= 5),
    byHour: [...hour.keys()].sort((a, b) => a - b).map((h) => ({ key: h, ...stat(hour.get(h)!) })),
    byGrade: GRADE_ORDER.map((g) => ({ key: g, ...stat(grade.get(g) ?? []), r: round(sum((grade.get(g) ?? []).map((x) => x.r ?? 0))) })),
    ungraded: grade.get("ungraded")?.length ?? 0,
    byMarket: [...sym.entries()].map(([k, xs]) => ({ key: k, ...stat(xs) })).sort((a, b) => b.trades - a.trades),
    bySide: (["long", "short"] as const).map((s) => ({ key: s, ...stat(side.get(s) ?? []) })),
    plan: {
      on: { trades: onPlan.length, avgR: round(avg(onPlan.map((r) => r.r).filter((v): v is number => v !== null))), pnl: round(sum(onPlan.map((r) => r.pnl)), 4)! },
      off: { trades: offPlan.length, avgR: round(avg(offPlan.map((r) => r.r).filter((v): v is number => v !== null))), pnl: round(sum(offPlan.map((r) => r.pnl)), 4)! },
    },
  };
}

export type Summary = ReturnType<typeof summarize>;
