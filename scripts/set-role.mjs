/**
 * Grants or revokes the admin role:
 *
 *   node --env-file=.env.local scripts/set-role.mjs <email> <user|admin>
 *
 * In production the same thing happens through the ADMIN_EMAIL variable, which
 * the pre-deploy step applies on every deploy.
 */
import { setRole, withSql } from "./db-tasks.mjs";

const [email, role] = process.argv.slice(2);

if (!email || (role !== "user" && role !== "admin")) {
  console.error("Usage: node scripts/set-role.mjs <email> <user|admin>");
  process.exit(1);
}

const ok = await withSql((sql) => setRole(sql, email, role));
if (!ok) process.exitCode = 1;
