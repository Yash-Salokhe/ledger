/**
 * Trade maths shared by the New trade form (live preview) and the server (stored values).
 * All amounts are in the instrument's quote currency × contract size.
 */
export type Side = "long" | "short";
export type Grade = "earned" | "good_loss" | "lucky" | "deserved";

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
const dir = (side: Side) => (side === "long" ? 1 : -1);

/** Net P&L after fees. quantity × contractSize = units (e.g. 1 lot × 100,000 for FX). */
export function pnl(t: { side: Side; quantity: number; entry: number; exit: number; contractSize: number; fees?: number }) {
  return round((t.exit - t.entry) * dir(t.side) * t.quantity * t.contractSize - (t.fees ?? 0));
}

/** Money at risk between entry and stop. Undefined when there is no stop on the right side. */
export function riskAmount(t: { side: Side; quantity: number; entry: number; stop?: number; contractSize: number }) {
  if (t.stop === undefined) return undefined;
  const perUnit = (t.entry - t.stop) * dir(t.side);
  if (perUnit <= 0) return undefined; // stop above a long / below a short: not a protective stop
  return round(perUnit * t.quantity * t.contractSize);
}

/** R-multiple: result measured in units of initial risk. +2R = made twice what was risked. */
export function rMultiple(netPnl: number, risk?: number) {
  return risk ? round(netPnl / risk, 2) : undefined;
}

/**
 * Ledger's process grade. The outcome alone never decides it:
 *  plan followed + win  → earned      plan followed + loss → good_loss
 *  plan broken   + win  → lucky       plan broken   + loss → deserved
 */
export function suggestGrade(netPnl: number, followedPlan: boolean): Grade {
  if (followedPlan) return netPnl >= 0 ? "earned" : "good_loss";
  return netPnl >= 0 ? "lucky" : "deserved";
}

export const GRADE_LABEL: Record<Grade, string> = {
  earned: "Earned it",
  good_loss: "Good loss",
  lucky: "Lucky",
  deserved: "Deserved it",
};
