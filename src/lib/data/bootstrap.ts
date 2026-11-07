import "server-only";
import { withUser } from "@/lib/db";
import { profile } from "@/lib/db/schema";

/** First authenticated visit: create the profile row (idempotent). */
export async function ensureProfile(userId: string) {
  await withUser(userId, (tx) => tx.insert(profile).values({ userId }).onConflictDoNothing());
}
