#!/usr/bin/env node
/**
 * Production migration runner. Applies db/migrations/*.sql in order, once each,
 * then makes sure the login roles the app and Ledger Coach connect with exist.
 *
 * Env:
 *   MIGRATION_DATABASE_URL  owner/superuser connection (creates tables, roles, RLS)
 *   APP_DB_PASSWORD         password for role `app_login`   (member of ledger_app, RLS enforced)
 *   COACH_DB_PASSWORD       optional; password for `coach_login` (member of ledger_coach_ro, read-only)
 *
 * Safe to run on every deploy: already-applied files are skipped, roles are upserted.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import postgres from "postgres";

// Local dev: read .env.local so the same command works on Windows, macOS and Linux.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL is not set");
  process.exit(1);
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists public._ledger_migrations (
    name text primary key, applied_at timestamptz not null default now())`;

  // Databases first migrated with drizzle-kit: count those as applied.
  const [{ count }] = await sql`select count(*)::int as count from public._ledger_migrations`;
  if (count === 0) {
    const [{ exists }] = await sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
    if (exists) {
      const [{ n }] = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
      const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort().slice(0, n);
      for (const f of files) await sql`insert into public._ledger_migrations (name) values (${f}) on conflict do nothing`;
      if (files.length) console.log(`baselined ${files.length} migration(s) from drizzle-kit`);
    }
  }

  const applied = new Set((await sql`select name from public._ledger_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = (await readFile(path.join(dir, file), "utf8")).replaceAll("--> statement-breakpoint", "");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public._ledger_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }

  await upsertLogin("app_login", "ledger_app", process.env.APP_DB_PASSWORD);
  await upsertLogin("coach_login", "ledger_coach_ro", process.env.COACH_DB_PASSWORD);

  // Tables added by future migrations stay reachable by the app role (RLS still applies).
  await sql.unsafe(`
    alter default privileges in schema public grant select, insert, update, delete on tables to ledger_app;
    alter default privileges in schema public grant usage, select on sequences to ledger_app;
    revoke all on public._ledger_migrations from ledger_app;
  `);

  console.log("migrations up to date");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end();
}

async function upsertLogin(name, group, password) {
  if (!password) return;
  const [{ exists }] = await sql`select exists(select 1 from pg_roles where rolname = ${name}) as exists`;
  // Role names are constants above; the password goes through format() so it is quoted safely.
  const verb = exists ? "alter" : "create";
  const [{ stmt }] = await sql`select format(${`${verb} role ${name} with login password %L`}, ${password}::text) as stmt`;
  await sql.unsafe(stmt);
  await sql.unsafe(`grant ${group} to ${name}`);
  console.log(`${exists ? "updated" : "created"} role ${name}`);
}
