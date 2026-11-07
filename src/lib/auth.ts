import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, magicLink, haveIBeenPwned } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendMail, emails } from "@/lib/email";

const social: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  social.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account" };
}
if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
  social.apple = { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET, appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER };
}

/**
 * Authentication: email + password, Google, Apple, magic link and passkeys.
 * Email must be verified (6-digit code) before first use. Single factor by product decision.
 */
export const auth = betterAuth({
  appName: "Ledger",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: [env.BETTER_AUTH_URL, "https://appleid.apple.com"],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 30,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({ to: user.email, ...emails.link(url, "reset") });
    },
  },
  emailVerification: { autoSignInAfterVerification: true },
  socialProviders: social,
  account: { accountLinking: { enabled: true, trustedProviders: ["google", "apple"] } },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh daily
    freshAge: 60 * 15, // sensitive actions (delete account, tokens) need a sign-in within 15 min
    cookieCache: { enabled: true, maxAge: 60 * 5 }, // signed cookie: most requests skip the session lookup
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/email-otp/*": { window: 60, max: 5 },
      "/sign-in/magic-link": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
    },
  },

  advanced: {
    useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      storeOTP: "hashed",
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        const purpose = type === "sign-in" ? "sign-in" : type === "forget-password" ? "reset" : "verify";
        await sendMail({ to: email, ...emails.code(otp, purpose) });
      },
    }),
    magicLink({
      expiresIn: 60 * 30,
      async sendMagicLink({ email, url }) {
        await sendMail({ to: email, ...emails.link(url, "magic") });
      },
    }),
    passkey({ rpName: "Ledger" }),
    haveIBeenPwned({ customPasswordCompromisedMessage: "This password has appeared in a data breach. Choose a different one." }),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;
