import { z } from "zod";

/**
 * Validated server environment. Importing this from client code is a bug,
 * so it throws if it ever runs in the browser.
 */
if (typeof window !== "undefined") {
  throw new Error("env.ts is server-only");
}

const schema = z.object({
  DATABASE_URL: z.string().url(),
  /** Read-only connection used by Ledger Coach and the MCP server (role: ledger_coach_ro). */
  DATABASE_URL_READONLY: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
  APPLE_APP_BUNDLE_IDENTIFIER: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Ledger <no-reply@ledger.local>"),
  /** 32-byte base64 key that encrypts broker API tokens at rest (AES-256-GCM). */
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
