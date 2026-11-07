import { describe, expect, it } from "vitest";
import { evaluate, inWindow, type Rule, type DayContext } from "./engine";

const twoADay: Rule = { id: "r1", kind: "max_trades_per_day", enforcement: "block", enabled: true, config: { max: 2 } };
const lossCap: Rule = { id: "r2", kind: "max_daily_loss", enforcement: "block", enabled: true, config: { amount: 300 } };
const window: Rule = { id: "r3", kind: "trading_window", enforcement: "warn", enabled: true, config: { start: "01:00", end: "10:00" } };
const risk: Rule = { id: "r4", kind: "max_risk_per_trade", enforcement: "block", enabled: true, config: { pct: 1 } };

const day = (over: Partial<DayContext> = {}): DayContext => ({
  tradesToday: 0, pnlToday: 0, localTime: "09:00", overriddenRuleIds: new Set(), ...over,
});

describe("max trades per day", () => {
  it("allows trades under the limit", () => {
    expect(evaluate([twoADay], day({ tradesToday: 1 })).canTrade).toBe(true);
  });

  it("locks New trade once the limit is reached", () => {
    const v = evaluate([twoADay], day({ tradesToday: 2 }));
    expect(v.canTrade).toBe(false);
    expect(v.lockReason).toBe("You've taken 2 of 2 trades today");
  });

  it("unlocks after a same-day override but still warns the user", () => {
    const v = evaluate([twoADay], day({ tradesToday: 2, overriddenRuleIds: new Set(["r1"]) }));
    expect(v.canTrade).toBe(true);
    expect(v.findings[0].overridden).toBe(true);
    expect(v.findings[0].message).toMatch(/breaks your own 2-trades-a-day rule/);
  });

  it("ignores disabled rules", () => {
    expect(evaluate([{ ...twoADay, enabled: false }], day({ tradesToday: 5 })).canTrade).toBe(true);
  });
});

describe("daily loss", () => {
  it("blocks at the limit, not before", () => {
    expect(evaluate([lossCap], day({ pnlToday: -299.99 })).canTrade).toBe(true);
    expect(evaluate([lossCap], day({ pnlToday: -300 })).canTrade).toBe(false);
  });
});

describe("trading window", () => {
  it("handles normal and overnight windows", () => {
    expect(inWindow("09:59", "01:00", "10:00")).toBe(true);
    expect(inWindow("10:00", "01:00", "10:00")).toBe(false);
    expect(inWindow("23:30", "22:00", "02:00")).toBe(true);
    expect(inWindow("03:00", "22:00", "02:00")).toBe(false);
  });

  it("warn-only rules never lock trading", () => {
    const v = evaluate([window], day({ localTime: "14:00" }));
    expect(v.canTrade).toBe(true);
    expect(v.findings).toHaveLength(1);
  });
});

describe("risk per trade", () => {
  it("checks the proposed trade", () => {
    expect(evaluate([risk], day(), { riskPct: 1 }).canTrade).toBe(true);
    expect(evaluate([risk], day(), { riskPct: 1.5 }).canTrade).toBe(false);
  });
});

it("reports every finding but locks on the first blocking one", () => {
  const v = evaluate([twoADay, lossCap, window], day({ tradesToday: 3, pnlToday: -500, localTime: "12:00" }));
  expect(v.findings.map((f) => f.kind)).toEqual(["max_trades_per_day", "max_daily_loss", "trading_window"]);
  expect(v.canTrade).toBe(false);
});
