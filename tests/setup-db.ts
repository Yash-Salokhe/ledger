import { vi } from "vitest";

/**
 * Integration-test harness: runs real server actions against a real Postgres
 * (RLS on, app role). Next.js request APIs are replaced with a fake signed-in user.
 * Set TEST_DATABASE_URL (app role) and TEST_ADMIN_URL (owner, for fixtures) to enable.
 */
export const enabled = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_ADMIN_URL);
if (enabled) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
}

export const current = { userId: "" };

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ user: { id: current.userId, email: `${current.userId}@test.dev`, name: "Test", emailVerified: true } }),
  getSession: async () => ({ user: { id: current.userId } }),
}));
