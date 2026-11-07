import "server-only";
import { eq } from "drizzle-orm";
import { withUser } from "@/lib/db";
import { profile } from "@/lib/db/schema";

/** First authenticated visit: create the profile row (idempotent). */
export async function ensureProfile(userId: string) {
  await withUser(userId, (tx) => tx.insert(profile).values({ userId }).onConflictDoNothing());
}

export async function getTourSeen(userId: string) {
  const [p] = await withUser(userId, (tx) => tx.select({ at: profile.tourCompletedAt }).from(profile).where(eq(profile.userId, userId)));
  return Boolean(p?.at);
}
