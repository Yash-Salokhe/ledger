import { describe, expect, it } from "vitest";
import { pnl, riskAmount, rMultiple, suggestGrade } from "./math";

describe("pnl", () => {
  it("FX long, 1 standard lot, 50 pips", () => {
    expect(pnl({ side: "long", quantity: 1, entry: 1.27, exit: 1.275, contractSize: 100000 })).toBe(500);
  });
  it("NIFTY short, 1 lot of 75, with fees", () => {
    expect(pnl({ side: "short", quantity: 1, entry: 24380, exit: 24400, contractSize: 75, fees: 40 })).toBe(-1540);
  });
  it("US equity long, 10 shares", () => {
    expect(pnl({ side: "long", quantity: 10, entry: 190.5, exit: 192.25, contractSize: 1 })).toBe(17.5);
  });
});

describe("risk and R", () => {
  it("long with stop below entry", () => {
    const risk = riskAmount({ side: "long", quantity: 1, entry: 1.27, stop: 1.2675, contractSize: 100000 });
    expect(risk).toBe(250);
    expect(rMultiple(500, risk)).toBe(2);
  });
  it("short with stop above entry", () => {
    expect(riskAmount({ side: "short", quantity: 1, entry: 24380, stop: 24420, contractSize: 75 })).toBe(3000);
  });
  it("ignores a stop on the wrong side", () => {
    expect(riskAmount({ side: "long", quantity: 1, entry: 100, stop: 105, contractSize: 1 })).toBeUndefined();
  });
  it("no risk means no R", () => {
    expect(rMultiple(100, undefined)).toBeUndefined();
  });
});

describe("process grade", () => {
  it.each([
    [500, true, "earned"],
    [-200, true, "good_loss"],
    [500, false, "lucky"],
    [-200, false, "deserved"],
  ] as const)("pnl %d, followed %s → %s", (p, followed, grade) => {
    expect(suggestGrade(p, followed)).toBe(grade);
  });
});
