/**
 * Print the taste memory for the seeded user, then refresh it — no browser and
 * no session.
 *
 *   pnpm tsx --env-file=.env.local scripts/try-taste.ts
 *   pnpm tsx --env-file=.env.local scripts/try-taste.ts --refresh --style <uuid>
 *
 * With LLM_MOCK=1 in .env.local the refresh runs the deterministic summarizer,
 * so this works without an API key. Needs a seeded user with feedback:
 * `pnpm db:seed`.
 */

import * as nodeModule from "node:module";

import type { TasteProfile } from "../src/lib/taste";

/**
 * `server-only` is supplied by the Next compiler, not by node_modules, so a
 * plain tsx run cannot resolve it. Stub it out before anything is imported.
 * `registerHooks` landed in Node 22.15 and is not in @types/node 20 yet.
 */
type ResolveHook = (specifier: string, context: unknown, next: (s: string, c: unknown) => unknown) => unknown;
type LoadHook = (url: string, context: unknown, next: (u: string, c: unknown) => unknown) => unknown;
const registerHooks = (
  nodeModule as unknown as {
    registerHooks?: (hooks: { resolve?: ResolveHook; load?: LoadHook }) => void;
  }
).registerHooks;

if (!registerHooks) {
  console.error("This script needs Node 22.15 or newer (module.registerHooks).");
  process.exit(1);
}

const STUB = "fitsss:server-only-stub";
registerHooks({
  resolve(specifier: string, context: unknown, next: (s: string, c: unknown) => unknown) {
    if (specifier === "server-only" || specifier === "client-only") {
      return { url: STUB, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url: string, context: unknown, next: (u: string, c: unknown) => unknown) {
    if (url === STUB) return { format: "commonjs", source: "", shortCircuit: true };
    return next(url, context);
  },
});

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const { eq } = await import("drizzle-orm");
  const { db, sql } = await import("../src/db");
  const { blocks, user } = await import("../src/db/schema");
  const {
    getTasteOverviewForUser,
    refreshTasteNotesForUser,
    tasteNotesForPrompt,
  } = await import("../src/server/taste-core");

  const email = arg("email") ?? process.env.SEED_EMAIL ?? "dev@fitsss.local";
  const [owner] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!owner) {
    console.error(`No user with email ${email}. Run \`pnpm db:seed\` first.`);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  const closet = await db.select().from(blocks).where(eq(blocks.userId, owner.id));
  const labels = new Map(closet.map((row) => [row.id, row.label]));

  const printProfile = (title: string, profile: TasteProfile) => {
    console.log(`\n${title}`);
    console.log(
      `  ${profile.totalEvents} event(s) available, ${profile.eventCount} considered at the last refresh${
        profile.lastRefreshedAt ? ` (${profile.lastRefreshedAt})` : " (never refreshed)"
      }`,
    );
    if (profile.lines.length) {
      console.log("  likes:");
      for (const line of profile.lines) {
        console.log(`    · ${line.text}${line.evidence ? ` (${line.evidence})` : ""} [${line.source}]`);
      }
    }
    if (profile.avoid.length) {
      console.log("  avoid:");
      for (const line of profile.avoid) {
        console.log(`    · ${line.text}${line.evidence ? ` (${line.evidence})` : ""} [${line.source}]`);
      }
    }
    for (const row of profile.favorites) {
      console.log(`    + ${labels.get(row.blockId) ?? row.blockId} — ${row.score}`);
    }
    for (const row of profile.skipped) {
      console.log(`    − ${labels.get(row.blockId) ?? row.blockId} — ${row.score}`);
    }
  };

  const styleId = arg("style") ?? null;

  const before = await getTasteOverviewForUser(owner.id);
  console.log(`Taste memory for ${email} — ${before.totalEvents} event(s) on file.`);
  printProfile("Overall", before.overall);
  for (const [id, profile] of Object.entries(before.byStyle)) printProfile(`Style ${id}`, profile);

  if (flag("refresh") || process.env.LLM_MOCK === "1") {
    console.log(`\nRefreshing ${styleId ? `style ${styleId}` : "the overall profile"}…`);
    const started = Date.now();
    const result = await refreshTasteNotesForUser(owner.id, styleId);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!result.ok) {
      console.log(`  no refresh (${result.code}): ${result.error}`);
    } else {
      printProfile(`Refreshed in ${seconds}s`, result.profile);
    }
  }

  const prompt = await tasteNotesForPrompt(owner.id, styleId);
  console.log("\nWhat the generator will read:\n");
  console.log(prompt ? prompt.split("\n").map((l) => `  ${l}`).join("\n") : "  (nothing yet)");

  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
