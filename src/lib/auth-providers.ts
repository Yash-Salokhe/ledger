import "server-only";
import { env } from "@/lib/env";
import type { Providers } from "@/components/auth/social";

/** Which social buttons to show. A provider without credentials is hidden, never broken. */
export const providers = (): Providers => ({
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  apple: Boolean(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET),
});
