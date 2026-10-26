/**
 * One-off database chores, shared by the pre-deploy step and the small CLIs
 * next to it.
 *
 * Plain ESM on runtime dependencies only (postgres), because these run inside
 * the deployed container, where drizzle-kit and tsx have been pruned away.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

/** Opens a connection, hands it to `fn`, and always closes it again. */
export async function withSql(fn) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Promotes or demotes an account. Returns false when the email is unknown. */
export async function setRole(sql, email, role) {
  if (role !== "user" && role !== "admin") throw new Error(`Unknown role: ${role}`);

  const rows = await sql`
    update "user" set role = ${role}, updated_at = now()
    where email = ${email} and role is distinct from ${role}
    returning email
  `;

  if (rows.length > 0) {
    console.log(`${email} is now ${role}.`);
    return true;
  }

  const [existing] = await sql`select role from "user" where email = ${email} limit 1`;
  if (!existing) {
    console.warn(`No user with email ${email}.`);
    return false;
  }

  console.log(`${email} is already ${existing.role}.`);
  return true;
}

/**
 * Gives an account the starting styles it is missing. Idempotent per name, so
 * a style added to seed-styles.json later lands on an account that already has
 * the earlier ones.
 */
export async function seedStyles(sql, email) {
  const seedStyles = JSON.parse(
    readFileSync(new URL("./seed-styles.json", import.meta.url), "utf8"),
  );

  const [account] = await sql`select id from "user" where email = ${email} limit 1`;
  if (!account) {
    console.warn(`No user with email ${email}.`);
    return false;
  }

  const existing = await sql`select name, sort_order from styles where user_id = ${account.id}`;
  const have = new Set(existing.map((row) => row.name));
  let nextOrder = existing.reduce((max, row) => Math.max(max, row.sort_order + 1), 0);

  const missing = seedStyles.filter((style) => !have.has(style.name));
  if (missing.length === 0) {
    console.log(`Styles skipped: ${email} already has all ${seedStyles.length} seed styles.`);
    return true;
  }

  await sql`
    insert into styles ${sql(
      missing.map((style) => ({
        user_id: account.id,
        name: style.name,
        description: style.description,
        rules: style.rules,
        sort_order: nextOrder++,
      })),
    )}
  `;

  console.log(`Seeded ${missing.length} style(s) for ${email}: ${missing.map((s) => s.name).join(", ")}.`);
  return true;
}
