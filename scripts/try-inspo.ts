/**
 * Drive the whole inspiration flow from the terminal — no browser, no session.
 *
 *   pnpm tsx --env-file=.env.local scripts/try-inspo.ts --file ./picture.png
 *   pnpm tsx --env-file=.env.local scripts/try-inspo.ts --url https://…/pin/123
 *
 * Imports a picture for the seeded user, reads it, matches it against the
 * closet and restyles it. With LLM_MOCK=1 in .env.local the analysis is the
 * deterministic stand-in, so this works without an API key. Needs a seeded
 * user with a closet: `pnpm db:seed`.
 *
 * The inspo it creates is left in the database on purpose — the UI needs one
 * to render against.
 */

import * as nodeModule from "node:module";
import { readFile } from "node:fs/promises";

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
  const { outfitBlockIds } = await import("../src/domain");
  const { isLlmConfigured, llmModel } = await import("../src/lib/llm/client");
  const {
    createInspoFromImageForUser,
    createInspoFromUrlForUser,
    analyzeInspoForUser,
  } = await import("../src/server/inspo-core");
  const { generateOutfitsForUser } = await import("../src/server/generate-core");

  const mock = process.env.LLM_MOCK === "1";
  if (!mock && !isLlmConfigured()) {
    console.error("ANTHROPIC_API_KEY is not set, and LLM_MOCK is not 1. Nothing to run.");
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

  const file = arg("file");
  const url = arg("url");
  if (!file && !url) {
    console.error("Pass --file <path to a picture> or --url <link>.");
    process.exitCode = 1;
    await sql.end();
    return;
  }

  console.log(`Importing for ${email} — ${mock ? "LLM_MOCK=1 (mock analysis)" : `model ${llmModel()}`}\n`);

  const started = Date.now();
  const created = file
    ? await createInspoFromImageForUser(owner.id, { bytes: await readFile(file), sourceUrl: url ?? null })
    : await createInspoFromUrlForUser(owner.id, url!);

  if (!created.ok) {
    console.error(`Import failed (${created.code}): ${created.error}`);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  // Creation already analyses; re-running proves the path is idempotent.
  const reanalysed = await analyzeInspoForUser(owner.id, created.inspo.id);
  if (!reanalysed.ok) {
    console.error(`Analysis failed (${reanalysed.code}): ${reanalysed.error}`);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  const inspo = reanalysed.inspo;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const analysis = inspo.analysis!;
  const match = inspo.match!;

  console.log(`Inspo ${inspo.id} — ${inspo.width}×${inspo.height}, served at ${inspo.imageUrl} (${seconds}s)`);
  console.log(`  source: ${inspo.sourceUrl ?? "upload"}\n`);

  console.log("ANALYSIS");
  console.log(`  summary: ${analysis.summary}`);
  console.log(`  vibe: ${analysis.vibe.join(", ")}`);
  console.log(`  silhouette: ${analysis.silhouette}`);
  console.log(`  palette: ${analysis.palette.join(" ")}`);
  console.log(`  formality: ${analysis.formality}/5 · model ${analysis.model}`);
  analysis.pieces.forEach((piece, i) => {
    const bits = [
      piece.color.name.toLowerCase(),
      piece.pattern !== "solid" ? piece.pattern : null,
      piece.fit ?? piece.variant ?? null,
      piece.material ?? null,
      piece.typeId,
    ].filter(Boolean);
    console.log(
      `  [${i}] ${piece.category}: ${bits.join(" ")} · ${piece.color.hex} · confidence ${piece.confidence.toFixed(2)}${piece.note ? ` · ${piece.note}` : ""}`,
    );
  });

  const closet = await db.select().from(blocks).where(eq(blocks.userId, owner.id));
  const labels = new Map(closet.map((row) => [row.id, row.label]));

  console.log("\nMATCH");
  console.log(`  coverage: ${(match.coverage * 100).toFixed(0)}% of the look`);
  for (const entry of match.matches) {
    console.log(
      `  ✓ [${entry.pieceIndex}] → ${labels.get(entry.blockId) ?? entry.blockId} (${entry.score.toFixed(2)})`,
    );
  }
  for (const gap of match.gaps) {
    console.log(`  ✗ [${gap.pieceIndex}] missing: ${gap.description}`);
  }

  console.log("\nRESTYLE");
  const restyle = await generateOutfitsForUser(owner.id, {
    occasion: "everyday",
    weather: { tempC: 18, condition: "cloudy", source: "manual" },
    count: 2,
    pinned: [],
    excluded: [],
    inspoId: inspo.id,
  });

  if (!restyle.ok) {
    console.error(`  failed (${restyle.code}): ${restyle.error}`);
    process.exitCode = 1;
    await sql.end();
    return;
  }

  for (const outfit of restyle.result.outfits) {
    console.log(`  — ${outfit.name}`);
    for (const id of outfitBlockIds(outfit.slots)) {
      console.log(`      ${labels.get(id) ?? id}`);
    }
    console.log(`    why: ${outfit.why}`);
    if (outfit.tip) console.log(`    tip: ${outfit.tip}`);
  }

  console.log(`\nLeft inspo ${inspo.id} in the database.`);
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
