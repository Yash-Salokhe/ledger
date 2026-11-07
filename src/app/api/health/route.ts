import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** Liveness + database reachability for the load balancer / container healthcheck. */
export async function GET() {
  await connection(); // always run at request time
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
