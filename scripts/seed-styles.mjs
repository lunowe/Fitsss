/**
 * Gives an existing account the starting styles, and nothing else:
 *
 *   node --env-file=.env.local scripts/seed-styles.mjs <email>
 *
 * The style prose lives in seed-styles.json, shared with `scripts/seed.ts`.
 */
import { seedStyles, withSql } from "./db-tasks.mjs";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/seed-styles.mjs <email>");
  process.exit(1);
}

const ok = await withSql((sql) => seedStyles(sql, email));
if (!ok) process.exitCode = 1;
