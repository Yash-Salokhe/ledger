import "server-only";
import { and, eq } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { instrument, profile, strategy, trade, tradingAccount } from "@/lib/db/schema";
import { pnl, riskAmount, rMultiple, suggestGrade, type Side } from "@/lib/trades/math";

type Tx = Parameters<Parameters<typeof withUser>[1]>[0];

/**
 * Sample journal so a new user can explore a full dashboard. Every row is flagged
 * is_demo_data, never reaches Coach (coach.trades excludes it) and is deleted the
 * moment the user adds a real account or logs a real trade.
 */
export async function seedDemo(userId: string) {
  await withUser(userId, async (tx) => {
    await clearDemo(tx, userId);
    const [acct] = await tx.insert(tradingAccount).values({
      userId, name: "Sample account", kind: "demo", currency: "USD", openingBalance: "10000", isDemoData: true,
    }).returning();
    const [plan] = await tx.insert(strategy).values({
      userId, name: "London Breakout", isDemoData: true,
      description: "Trade the break of the Asian range after the London open.",
      checklist: [
        { id: "range", label: "Marked the Asian session range" },
        { id: "close", label: "Waited for a candle close outside the range" },
        { id: "risk", label: "Risked 1% with the stop beyond the range" },
        { id: "time", label: "Entered after the 08:00 London open" },
      ],
    }).returning();
    const inst = await tx.select().from(instrument);
    const bySym = new Map(inst.map((i) => [i.symbol, i]));

    // [symbol, side, entry, exit, stop, qty, followedPlan, daysAgo]
    const rows: [string, Side, number, number, number, number, boolean, number][] = [
      ["GBPUSD", "long", 1.2702, 1.2745, 1.2680, 1, true, 41], ["EURUSD", "short", 1.0912, 1.0934, 1.0930, 1, true, 39],
      ["GBPUSD", "long", 1.2655, 1.2701, 1.2633, 1, true, 36], ["USDJPY", "long", 149.20, 148.95, 148.90, 1, false, 33],
      ["NAS100", "short", 18420, 18465, 18460, 2, false, 30], ["GBPUSD", "short", 1.2801, 1.2760, 1.2822, 1, true, 27],
      ["XAUUSD", "long", 2401, 2393, 2394, 1, true, 24], ["EURUSD", "long", 1.0850, 1.0889, 1.0831, 1, false, 20],
      ["GBPUSD", "long", 1.2690, 1.2738, 1.2668, 1, true, 16], ["USDJPY", "short", 150.10, 150.42, 150.40, 1, true, 12],
      ["GBPUSD", "long", 1.2715, 1.2756, 1.2694, 1, true, 8], ["NAS100", "long", 18610, 18688, 18575, 2, true, 5],
      ["EURUSD", "short", 1.0870, 1.0846, 1.0884, 1, true, 3], ["GBPUSD", "long", 1.2733, 1.2742, 1.2712, 1, false, 1],
    ];
    const values = rows.flatMap(([sym, side, entry, exit, stop, qty, followed, ago], i) => {
      const ins = bySym.get(sym);
      if (!ins) return [];
      const cs = Number(ins.contractSize);
      // Pip-valued FX P&L in quote currency; JPY pairs are converted roughly to USD for the sample.
      const fx = ins.quoteCurrency === "JPY" ? 1 / 150 : 1;
      const net = pnl({ side, quantity: qty, entry, exit, contractSize: cs }) * fx;
      const risk = (riskAmount({ side, quantity: qty, entry, stop, contractSize: cs }) ?? 0) * fx;
      const opened = new Date(Date.now() - ago * 86400000);
      opened.setUTCHours(7, 30 + (i % 4) * 7, 0, 0);
      return [{
        userId, accountId: acct.id, instrumentId: ins.id, strategyId: plan.id, side, status: "closed" as const,
        openedAt: opened, closedAt: new Date(opened.getTime() + 95 * 60000), quantity: String(qty),
        entryPrice: String(entry), exitPrice: String(exit), stopPrice: String(stop),
        pnl: net.toFixed(4), riskAmount: risk ? risk.toFixed(4) : null, rMultiple: risk ? String(rMultiple(net, risk)) : null,
        followedPlan: followed, grade: i === 13 ? null : suggestGrade(net, followed),
        checklistMet: followed ? ["range", "close", "risk", "time"] : ["range", "risk"],
        source: "manual" as const, isDemoData: true,
      }];
    });
    await tx.insert(trade).values(values);
    await tx.update(profile).set({ demoMode: true }).where(eq(profile.userId, userId));
  });
}

/** Removes every sample row. Cascades remove demo trades with the demo account. */
export async function clearDemo(tx: Tx, userId: string) {
  await tx.delete(tradingAccount).where(and(eq(tradingAccount.userId, userId), eq(tradingAccount.isDemoData, true)));
  await tx.delete(strategy).where(and(eq(strategy.userId, userId), eq(strategy.isDemoData, true)));
  await tx.update(profile).set({ demoMode: false }).where(eq(profile.userId, userId));
}
