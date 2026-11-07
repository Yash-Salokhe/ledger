"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { tradingAccount, weeklyReview } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

const Input = z.object({
  accountId: z.guid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1, "Weeks start on Monday"),
  field: z.enum(["wentWell", "toImprove", "focusNext"]),
  value: z.string().max(5000),
});

/** Autosaves one reflection field (upsert on user + account + week). */
export async function saveReflection(input: z.input<typeof Input>) {
  const { user } = await requireSession();
  const p = Input.safeParse(input);
  if (!p.success) return { error: "Couldn't save that." };
  const { accountId, weekStart, field, value } = p.data;
  return withUser(user.id, async (tx) => {
    const [a] = await tx.select({ id: tradingAccount.id }).from(tradingAccount).where(and(eq(tradingAccount.id, accountId), eq(tradingAccount.userId, user.id)));
    if (!a) return { error: "That account no longer exists." };
    await tx.insert(weeklyReview).values({ userId: user.id, accountId, weekStart, [field]: value || null })
      .onConflictDoUpdate({ target: [weeklyReview.userId, weeklyReview.accountId, weeklyReview.weekStart], set: { [field]: value || null } });
    return { ok: true as const };
  });
}
