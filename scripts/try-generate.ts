/**
 * Drive the real generation engine from the terminal, no browser and no session.
 *
 *   pnpm tsx --env-file=.env.local scripts/try-generate.ts
 *   pnpm tsx --env-file=.env.local scripts/try-generate.ts --occasion work --temp 6 --condition rain --count 2
 *
 * Needs ANTHROPIC_API_KEY in the environment (or .env.local) and a seeded user
 * with a closet: `pnpm db:seed`.
 */

import * as nodeModule from "node:module";

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

async function main() {
  const { eq } = await import("drizzle-orm");
  const { db, sql } = await import("../src/db");
  const { blocks, user } = await import("../src/db/schema");
  const { isOccasionId, outfitBlockIds, WEATHER_CONDITIONS } = await import("../src/domain");
  const { validateGenerationRequest } = await import("../src/lib/llm/generation-request");
  const { isLlmConfigured, llmEffort, llmModel } = await import("../src/lib/llm/client");
  const { generateOutfitsForUser } = await import("../src/server/generate-core");

  if (!isLlmConfigured()) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local and run again.");
    process.exitCode = 1;
    await sql.end();
    return;
  }

  const email = arg("email") ?? process.env.SEED_EMAIL ?? "dev@fitsss.local";
  const [owner] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!owner) {
    console.error(`No user with email ${email}. Run \`pnpm db:seed\` first.`);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  const occasion = arg("occasion") ?? "everyday";
  if (!isOccasionId(occasion)) {
    console.error(`Unknown occasion "${occasion}".`);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  const condition = arg("condition") ?? "cloudy";
  if (!(WEATHER_CONDITIONS as readonly string[]).includes(condition)) {
    console.error(`Unknown condition "${condition}". One of: ${WEATHER_CONDITIONS.join(", ")}.`);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  const tempC = Number(arg("temp") ?? 14);
  const parsed = validateGenerationRequest({
    occasion,
    count: Number(arg("count") ?? 3),
    steer: arg("steer"),
    styleId: arg("style"),
    pinned: [],
    excluded: [],
    weather: {
      tempC,
      feelsLikeC: tempC - 1,
      lowC: tempC - 5,
      precipitationChance: condition === "rain" || condition === "storm" ? 80 : 10,
      condition,
      source: "manual",
    },
  });

  if (!parsed.ok) {
    console.error(`Bad request: ${parsed.errors.join(", ")}`);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  const closet = await db.select().from(blocks).where(eq(blocks.userId, owner.id));
  const labels = new Map(closet.map((row) => [row.id, row.label]));

  console.log(
    `Generating ${parsed.request.count} outfit(s) for ${email} — ${occasion}, ${tempC}° ${condition}, model ${llmModel()} at effort ${llmEffort()}…\n`,
  );

  const started = Date.now();
  const result = await generateOutfitsForUser(owner.id, parsed.request);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (!result.ok) {
    console.error(`Failed (${result.code}) after ${seconds}s: ${result.error}`);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  console.log(
    `Generation ${result.result.id} — ${result.result.outfits.length} outfit(s) in ${seconds}s, ${result.result.filteredOutCount} piece(s) filtered out by the weather.\n`,
  );

  for (const outfit of result.result.outfits) {
    console.log(`— ${outfit.name}`);
    for (const id of outfitBlockIds(outfit.slots)) {
      console.log(`    ${labels.get(id) ?? id}`);
    }
    console.log(`  why: ${outfit.why}`);
    if (outfit.tip) console.log(`  tip: ${outfit.tip}`);
    console.log("");
  }

  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
