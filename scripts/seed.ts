import { count, eq } from "drizzle-orm";
import { auth } from "../src/lib/auth";
import { db, sql } from "../src/db";
import { blocks, styles, user } from "../src/db/schema";
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

/** Three honest starting styles for the dev user. */
const seedStyles = [
  {
    name: "Clean minimal",
    description:
      "Neutrals only: white, grey, navy, black, cream. A relaxed tee or a fine knit with straight trousers, white leather sneakers or loafers. One dark anchor piece holds the outfit together.",
    rules: "No logos\nMax one pattern per outfit\nNothing baggy on both halves",
  },
  {
    name: "Smart casual",
    description:
      "A shirt or a knit with chinos or wool trousers, loafers or chelsea boots. A blazer or an overshirt on top when it is cool. Put together without looking like the office.",
    rules: "No sweatpants\nNo graphic tees\nShoes always leather",
  },
  {
    name: "Streetwear",
    description:
      "Oversized hoodie or a graphic tee over wide, baggy bottoms. Chunky or retro sneakers, a cap when the hair says so. Volume on top, volume below, one loud piece at a time.",
    rules: "Never fitted tops\nOne loud piece per outfit",
  },
];

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

  await seedBlocksFor(devUser.id);
  await seedStylesFor(devUser.id);
}

async function seedStylesFor(userId: string) {
  const [{ value: existingStyles }] = await db
    .select({ value: count() })
    .from(styles)
    .where(eq(styles.userId, userId));

  if (existingStyles > 0) {
    console.log(`Styles skipped: ${email} already has ${existingStyles} styles.`);
    return;
  }

  await db.insert(styles).values(
    seedStyles.map((style, index) => ({
      userId,
      name: style.name,
      description: style.description,
      rules: style.rules,
      sortOrder: index,
    })),
  );

  console.log(`Seeded ${seedStyles.length} styles for ${email}.`);
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
