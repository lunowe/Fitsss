/**
 * Railway's pre-deploy command: brings the database up to date before the new
 * container takes traffic.
 *
 * Runs the drizzle migrations, then two idempotent bootstrap steps that only
 * do something when their variable is set:
 *
 *   ADMIN_EMAIL         that account is (kept) an admin — safe to leave set
 *   SEED_STYLES_EMAIL   that account gets any starting styles it is missing;
 *                       unset it again once seeded, or a deleted style would
 *                       come back on the next deploy
 *
 * An unknown email warns rather than failing: a typo in a variable should not
 * block a deploy.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { seedStyles, setRole, withSql } from "./db-tasks.mjs";

await withSql(async (sql) => {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");

  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (adminEmail) await setRole(sql, adminEmail, "admin");

  const seedEmail = process.env.SEED_STYLES_EMAIL?.trim();
  if (seedEmail) await seedStyles(sql, seedEmail);
});
