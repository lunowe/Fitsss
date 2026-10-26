import { readFileSync } from "node:fs";

import { count, eq } from "drizzle-orm";
import { auth } from "../src/lib/auth";
import { db, sql } from "../src/db";
import { blocks, generations, inspos, looks, outfitEvents, styles, tasteNotes, user } from "../src/db/schema";
import { derive, paletteToBlockColor, validateBlockInput, type BlockInput } from "../src/domain";


const email = "dev@fitsss.local";
const password = process.env.SEED_PASSWORD ?? "fitsss-dev-1234";

const rawInputs: unknown[] = [
  ["t-shirt", "white", "relaxed", "cotton"],
  ["t-shirt", "black", "regular", "cotton"],
  ["t-shirt", "grey", "oversized", "jersey"],
  ["long-sleeve-tee", "off-white", "regular", "cotton"],
  ["shirt", "light-blue", "regular", "cotton"],
  ["dress-shirt", "white", "regular", "cotton"],
  ["crewneck-sweater", "navy", "regular", "wool"],
  ["hoodie", "grey", "oversized", "fleece"],
  ["cardigan", "cream", "relaxed", "wool"],
  ["overshirt", "olive", "relaxed", "twill"],
  ["denim-jacket", "denim", "regular", "denim"],
  ["leather-jacket", "black", "regular", "leather"],
  ["trench-coat", "beige", "regular", "cotton"],
  ["wool-coat", "camel", "regular", "wool"],
  ["jeans", "denim", "straight", "denim"],
  ["jeans", "black", "straight", "denim"],
  ["trousers", "black", "wide", "wool"],
  ["chinos", "beige", "straight", "cotton"],
  ["shorts", "navy", "regular", "cotton"],
].map(([typeId, color, fit, material]) => ({
  typeId,
  color: paletteToBlockColor(color),
  fit,
  material,
  pattern: "solid",
  quantity: 1,
}));

rawInputs.push(
  { typeId: "sneakers", color: paletteToBlockColor("white"), variant: "low-top", material: "leather", pattern: "solid", quantity: 1 },
  { typeId: "boots", color: paletteToBlockColor("black"), variant: "chelsea", material: "leather", pattern: "solid", quantity: 1 },
  { typeId: "loafers", color: paletteToBlockColor("brown"), variant: "penny", material: "leather", pattern: "solid", quantity: 1 },
  { typeId: "cap", color: paletteToBlockColor("black"), variant: "baseball", material: "cotton", pattern: "solid", quantity: 1 },
  { typeId: "belt", color: paletteToBlockColor("black"), variant: "leather", material: "leather", pattern: "solid", quantity: 1 },
  { typeId: "scarf", color: paletteToBlockColor("grey"), variant: "wool-scarf", material: "wool", pattern: "solid", quantity: 1 },
);

/**
 * The starting styles, shared with `scripts/seed-styles.mjs` so the prose the
 * model reads lives in exactly one place. Read rather than imported: the .mjs
 * runs on runtime dependencies alone, inside the deployed container.
 */
const seedStyles: { name: string; description: string; rules: string }[] = JSON.parse(
  readFileSync(new URL("./seed-styles.json", import.meta.url), "utf8"),
);

function validatedInputs(): BlockInput[] {
  return rawInputs.map((input, index) => {
    const result = validateBlockInput(input);
    if (!result.ok) throw new Error(`Seed block ${index} is invalid: ${result.errors.join(", ")}`);
    return result.value;
  });
}

async function main() {
  let [devUser] = await db.select().from(user).where(eq(user.email, email)).limit(1);

  if (!devUser) {
    await auth.api.signUpEmail({ body: { email, password, name: "Fitsss Dev" } });
    [devUser] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  }

  if (!devUser) throw new Error("Seed user could not be created");

  if (process.argv.includes("--reset")) await resetClosetFor(devUser.id);

  await seedBlocksFor(devUser.id);
  await seedStylesFor(devUser.id);
}

/**
 * `pnpm db:seed --reset`: wipes the dev user's closet and everything derived
 * from it (looks, generations, feedback, taste notes, inspiration pictures)
 * so the seed runs fresh. Keeps styles, custom categories and piece types,
 * artwork and settings, which are configuration rather than data.
 */
async function resetClosetFor(userId: string) {
  await db.delete(outfitEvents).where(eq(outfitEvents.userId, userId));
  await db.delete(looks).where(eq(looks.userId, userId));
  await db.delete(generations).where(eq(generations.userId, userId));
  await db.delete(tasteNotes).where(eq(tasteNotes.userId, userId));
  await db.delete(inspos).where(eq(inspos.userId, userId));
  await db.delete(blocks).where(eq(blocks.userId, userId));
  console.log(`Reset: cleared closet, looks, generations, feedback, taste notes and pictures for ${email}.`);
}

async function seedStylesFor(userId: string) {
  // Idempotent per name, so a style added to this list later lands on a
  // database that already has the earlier ones.
  const existing = await db
    .select({ name: styles.name, sortOrder: styles.sortOrder })
    .from(styles)
    .where(eq(styles.userId, userId));
  const have = new Set(existing.map((s) => s.name));
  let nextOrder = existing.reduce((max, s) => Math.max(max, s.sortOrder + 1), 0);

  const missing = seedStyles.filter((style) => !have.has(style.name));
  if (missing.length === 0) {
    console.log(`Styles skipped: ${email} already has all ${seedStyles.length} seed styles.`);
    return;
  }

  await db.insert(styles).values(
    missing.map((style) => ({
      userId,
      name: style.name,
      description: style.description,
      rules: style.rules,
      sortOrder: nextOrder++,
    })),
  );

  console.log(`Seeded ${missing.length} style(s) for ${email}: ${missing.map((s) => s.name).join(", ")}.`);
}

async function seedBlocksFor(userId: string) {
  const [{ value: existingBlocks }] = await db
    .select({ value: count() })
    .from(blocks)
    .where(eq(blocks.userId, userId));

  if (existingBlocks > 0) {
    console.log(`Blocks skipped: ${email} already has ${existingBlocks} blocks.`);
    return;
  }

  const inputs = validatedInputs();
  await db.insert(blocks).values(
    inputs.map((input) => {
      const derived = derive(input);
      return {
        userId,
        typeId: input.typeId,
        category: derived.category,
        color: input.color,
        secondaryColor: input.secondaryColor,
        fit: input.fit,
        variant: input.variant,
        material: input.material,
        pattern: input.pattern,
        weight: input.weight,
        effectiveWeight: derived.effectiveWeight,
        quantity: input.quantity,
        nickname: input.nickname,
        notes: input.notes,
        warmth: derived.warmth,
        formality: derived.formality,
        seasons: derived.seasons,
        label: derived.label,
      };
    }),
  );

  console.log(`Seeded ${inputs.length} blocks for ${email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
