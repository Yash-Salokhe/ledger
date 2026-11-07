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
  /** Breached-password check via Have I Been Pwned (k-anonymity; only a 5-char hash prefix leaves the server). Keep on in production. */
  PASSWORD_BREACH_CHECK: z.enum(["on", "off"]).default("on"),
});

/**
 * `next build` imports server modules to collect route config, but secrets are
 * only provided at runtime (docker run --env-file, compose). During the build
 * phase we fill harmless placeholders; at runtime the real values are required.
 */
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const source = isBuild
  ? {
      DATABASE_URL: "postgres://build:build@127.0.0.1:5432/build",
      BETTER_AUTH_SECRET: "build-time-placeholder-not-used-at-runtime-000",
      ...process.env,
    }
  : process.env;

export const env = schema.parse(source);
