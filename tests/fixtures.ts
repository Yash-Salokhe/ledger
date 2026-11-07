import postgres from "postgres";

/** Owner connection for creating fixtures (bypasses RLS on purpose). */
export const admin = () => postgres(process.env.TEST_ADMIN_URL!, { max: 1, onnotice: () => {} });

export async function makeUser(sql: postgres.Sql, opts: { tz?: string } = {}) {
  const id = `t_${Math.random().toString(36).slice(2, 10)}`;
  await sql`insert into "user"(id, name, email, email_verified) values (${id}, 'Test', ${id + "@test.dev"}, true)`;
  await sql`insert into profile(user_id, timezone) values (${id}, ${opts.tz ?? "UTC"})`;
  const [acct] = await sql`insert into trading_account(user_id, name, currency, opening_balance) values (${id}, 'Main', 'INR', 500000) returning id`;
  const [nifty] = await sql`select id from instrument where exchange = 'XNSE' and symbol = 'NIFTY'`;
  return { id, accountId: acct.id as string, niftyId: nifty.id as string };
}

export async function cleanup(sql: postgres.Sql, ids: string[]) {
  if (ids.length) await sql`delete from "user" where id in ${sql(ids)}`;
  await sql.end();
}
