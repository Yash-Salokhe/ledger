import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * One pooled connection per server instance. In production put PgBouncer
 * (transaction mode) in front of Postgres, so `prepare: false`.
 */
const globalForDb = globalThis as unknown as { pg?: postgres.Sql };
const client =
  globalForDb.pg ??
  postgres(env.DATABASE_URL, { max: 10, idle_timeout: 20, prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;

/**
 * Runs `fn` in a transaction scoped to one user. Postgres row-level security
 * reads `app.user_id`, so a query can only ever see that user's rows, even if
 * the application code forgets a WHERE clause.
 */
export async function withUser<T>(userId: string, fn: (tx: Parameters<Parameters<DB["transaction"]>[0]>[0]) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
