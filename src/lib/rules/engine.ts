/**
 * Discipline rules engine. Pure functions — no I/O — so the same logic runs
 * on the server (authoritative, before a trade is saved) and in the browser
 * (instant UI: greying out "New trade", showing the warning).
 */

export type RuleKind = "max_trades_per_day" | "max_daily_loss" | "trading_window" | "max_risk_per_trade";

export type Rule =
  | { id: string; kind: "max_trades_per_day"; enforcement: "block" | "warn"; enabled: boolean; config: { max: number } }
  | { id: string; kind: "max_daily_loss"; enforcement: "block" | "warn"; enabled: boolean; config: { amount: number } }
  | { id: string; kind: "trading_window"; enforcement: "block" | "warn"; enabled: boolean; config: { start: string; end: string } }
  | { id: string; kind: "max_risk_per_trade"; enforcement: "block" | "warn"; enabled: boolean; config: { pct: number } };

export type DayContext = {
  /** Trades already opened today (user's timezone), from daily_account_stat. */
  tradesToday: number;
  /** Net P&L today in account currency (negative = loss). */
  pnlToday: number;
  /** Local wall-clock time in the user's timezone, "HH:MM". */
  localTime: string;
  /** Rule ids the user has unlocked for today in Settings. */
  overriddenRuleIds: ReadonlySet<string>;
};

export type ProposedTrade = { riskPct?: number };

export type Finding = {
  ruleId: string;
  kind: RuleKind;
  severity: "block" | "warn";
  overridden: boolean;
  title: string;
  message: string;
};

export type Verdict = {
  /** False when any blocking rule applies and has not been overridden today. */
  canTrade: boolean;
  findings: Finding[];
  /** Shown on the greyed-out New trade button. */
  lockReason?: string;
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** True when `t` is inside [start, end). Handles windows that cross midnight (e.g. 22:00–02:00). */
export function inWindow(t: string, start: string, end: string) {
  const x = toMinutes(t), s = toMinutes(start), e = toMinutes(end);
  return s <= e ? x >= s && x < e : x >= s || x < e;
}

const fmtMoney = (n: number) => Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

export function evaluate(rules: Rule[], day: DayContext, proposed: ProposedTrade = {}): Verdict {
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const overridden = day.overriddenRuleIds.has(rule.id);
    const base = { ruleId: rule.id, kind: rule.kind, severity: rule.enforcement, overridden } as const;

    switch (rule.kind) {
      case "max_trades_per_day": {
        if (day.tradesToday >= rule.config.max) {
          const n = rule.config.max;
          findings.push({
            ...base,
            title: `You've taken ${day.tradesToday} of ${n} trades today`,
            message: overridden
              ? `You unlocked this for today. Any trade now breaks your own ${n}-trade${n === 1 ? "" : "s"}-a-day rule and will be flagged in your weekly review.`
              : `Your rule is ${n} trade${n === 1 ? "" : "s"} a day. New trades unlock tomorrow, or you can override the rule in Settings.`,
          });
        }
        break;
      }
      case "max_daily_loss": {
        if (day.pnlToday <= -rule.config.amount) {
          findings.push({
            ...base,
            title: `Daily loss limit reached`,
            message: `You're down ${fmtMoney(day.pnlToday)} today. Your limit is ${fmtMoney(rule.config.amount)}. Step away and review instead.`,
          });
        }
        break;
      }
      case "trading_window": {
        const { start, end } = rule.config;
        if (!inWindow(day.localTime, start, end)) {
          findings.push({
            ...base,
            title: `Outside your trading window`,
            message: `You trade between ${start} and ${end}. It's ${day.localTime} now.`,
          });
        }
        break;
      }
      case "max_risk_per_trade": {
        if (proposed.riskPct !== undefined && proposed.riskPct > rule.config.pct) {
          findings.push({
            ...base,
            title: `Risk above ${rule.config.pct}%`,
            message: `This trade risks ${proposed.riskPct}% of the account. Your limit is ${rule.config.pct}%.`,
          });
        }
        break;
      }
    }
  }

  const blocking = findings.find((f) => f.severity === "block" && !f.overridden);
  return { canTrade: !blocking, findings, lockReason: blocking?.title };
}
