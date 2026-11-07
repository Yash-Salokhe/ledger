"use server";
import { eq } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { profile } from "@/lib/db/schema";
import { requireSession } from "@/lib/session";

/** Marks the guided tour as seen (finished or skipped) so it never shows again. */
export async function completeTour() {
  const { user } = await requireSession();
  await withUser(user.id, (tx) => tx.update(profile).set({ tourCompletedAt: new Date() }).where(eq(profile.userId, user.id)));
}
