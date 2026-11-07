import { describe, expect, it } from "vitest";
import { summarize, type Row } from "./summarize";

const row = (o: Partial<Row>): Row => ({ pnl: 0, r: null, day: "2026-10-01", dow: 4, hour: 9, grade: null, followedPlan: null, side: "long", symbol: "NIFTY", ...o });

const rows: Row[] = [
  row({ pnl: 200, r: 2, day: "2026-10-01", dow: 4, hour: 9, grade: "earned", followedPlan: true }),
  row({ pnl: -100, r: -1, day: "2026-10-01", dow: 4, hour: 14, grade: "good_loss", followedPlan: true }),
  row({ pnl: 150, r: 1.5, day: "2026-10-02", dow: 5, hour: 9, grade: "lucky", followedPlan: false, symbol: "GBPUSD" }),
  row({ pnl: -300, r: -3, day: "2026-10-05", dow: 1, hour: 10, grade: "deserved", followedPlan: false, side: "short" }),
  row({ pnl: 100, r: 1, day: "2026-10-06", dow: 2, hour: 9 }),
];

describe("summarize", () => {
  const s = summarize(rows, 1000);

  it("headline figures", () => {
    expect(s).toMatchObject({ trades: 5, net: 50, winRate: 60, avgWin: 150, avgLoss: -200, profitFactor: 1.13, expectancyR: 0.1 });
  });

  it("equity curve and max drawdown (peak 1250 → trough 950)", () => {
    expect(s.equity.map((e) => e.balance)).toEqual([1000, 1100, 1250, 950, 1050]);
    expect(s.maxDrawdown).toBe(300);
    expect(s.maxDrawdownPct).toBe(24);
  });

  it("R distribution uses open-ended end bins", () => {
    const at = (label: string) => s.rDistribution.find((b) => b.label === label)!.count;
    expect(at("≤ -1.5")).toBe(1); // -3
    expect(at("-1 to -0.5")).toBe(1); // -1
    expect(at("1 to 1.5")).toBe(1); // 1
    expect(at("1.5 to 2")).toBe(1); // 1.5
    expect(at("2 to 2.5")).toBe(1); // 2
    expect(s.rDistribution.reduce((a, b) => a + b.count, 0)).toBe(5);
  });

  it("process: on plan vs off plan", () => {
    expect(s.plan.on).toEqual({ trades: 2, avgR: 0.5, pnl: 100 });
    expect(s.plan.off).toEqual({ trades: 2, avgR: -0.75, pnl: -150 });
  });

  it("grades in fixed order, with ungraded counted separately", () => {
    expect(s.byGrade.map((g) => [g.key, g.trades, g.r])).toEqual([["earned", 1, 2], ["lucky", 1, 1.5], ["good_loss", 1, -1], ["deserved", 1, -3]]);
    expect(s.ungraded).toBe(1);
  });

  it("weekday keeps Mon–Fri even when empty, hour lists only traded hours", () => {
    expect(s.byWeekday.map((d) => d.key)).toEqual([1, 2, 3, 4, 5]);
    expect(s.byWeekday.find((d) => d.key === 4)).toMatchObject({ trades: 2, pnl: 100 });
    expect(s.byHour.map((h) => [h.key, h.trades])).toEqual([[9, 3], [10, 1], [14, 1]]);
  });

  it("handles no trades", () => {
    const e = summarize([], 500);
    expect(e).toMatchObject({ trades: 0, net: 0, winRate: null, profitFactor: null, expectancyR: null, maxDrawdown: 0 });
  });
});
