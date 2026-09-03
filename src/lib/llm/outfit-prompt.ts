import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import {
  CATEGORY_LABELS,
  WEATHER_CONDITION_LABELS,
  describeBlockForPrompt,
  getOccasion,
  type Block,
  type Category,
  type GenerationRequest,
  type WeatherSnapshot,
} from "@/domain";

/**
 * Pure prompt construction for outfit generation. No SDK calls, no database,
 * no clock: the same inputs always produce the same bytes, which is what makes
 * the cached system prompt actually hit.
 */

/* ------------------------------------------------------------------ */
/* Short ids                                                           */
/* ------------------------------------------------------------------ */

/** One letter per category so the model can tell slots apart at a glance. */
const CATEGORY_PREFIX: Record<Category, string> = {
  top: "t",
  layer: "l",
  outerwear: "o",
  bottom: "b",
  fullbody: "d",
  footwear: "f",
  accessory: "a",
};

/** Listing order of the closet in the prompt. */
const CATEGORY_ORDER: readonly Category[] = [
  "top",
  "layer",
  "outerwear",
  "fullbody",
  "bottom",
  "footwear",
  "accessory",
];

export interface ShortIdIndex {
  /** Candidates in prompt order, each with the short id the model sees. */
  entries: { shortId: string; block: Block }[];
  /** short id -> real block id */
  toReal: Map<string, string>;
  /** real block id -> short id */
  toShort: Map<string, string>;
}

/** Deterministic: same candidates in any order produce the same short ids. */
export function buildShortIds(candidates: Block[]): ShortIdIndex {
  const sorted = [...candidates].sort((a, b) => {
    const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (byCategory !== 0) return byCategory;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const counters = new Map<Category, number>();
  const entries: ShortIdIndex["entries"] = [];
  const toReal = new Map<string, string>();
  const toShort = new Map<string, string>();

  for (const block of sorted) {
    const next = (counters.get(block.category) ?? 0) + 1;
    counters.set(block.category, next);
    const shortId = `${CATEGORY_PREFIX[block.category]}${next}`;
    entries.push({ shortId, block });
    toReal.set(shortId, block.id);
    toShort.set(block.id, shortId);
  }

  return { entries, toReal, toShort };
}

/* ------------------------------------------------------------------ */
/* Structured output                                                   */
/* ------------------------------------------------------------------ */

export const outfitsOutputSchema = z.object({
  outfits: z.array(
    z.object({
      name: z.string(),
      top: z.string().optional(),
      layer: z.string().optional(),
      outerwear: z.string().optional(),
      bottom: z.string().optional(),
      fullbody: z.string().optional(),
      footwear: z.string(),
      accessories: z.array(z.string()),
      why: z.string(),
      tip: z.string().optional(),
    }),
  ),
});

export type OutfitsOutput = z.infer<typeof outfitsOutputSchema>;
export type RawOutfit = OutfitsOutput["outfits"][number];

/** Shape `validateOutfit` expects, with real block ids. */
export interface ResolvedOutfit {
  name: string;
  slots: {
    top?: string;
    layer?: string;
    outerwear?: string;
    bottom?: string;
    fullbody?: string;
    footwear?: string;
    accessories: string[];
  };
  why: string;
  tip?: string;
}

/**
 * Maps short ids back to real block ids. An id the model invented is passed
 * through unchanged so `validateOutfit` reports it instead of silently
 * dropping the reference.
 */
export function resolveOutfit(raw: RawOutfit, index: ShortIdIndex): ResolvedOutfit {
  const real = (shortId: string | undefined): string | undefined => {
    if (typeof shortId !== "string") return undefined;
    const key = shortId.trim();
    if (!key) return undefined;
    return index.toReal.get(key) ?? key;
  };

  return {
    name: typeof raw.name === "string" ? raw.name : "",
    slots: {
      top: real(raw.top),
      layer: real(raw.layer),
      outerwear: real(raw.outerwear),
      bottom: real(raw.bottom),
      fullbody: real(raw.fullbody),
      footwear: real(raw.footwear),
      accessories: (Array.isArray(raw.accessories) ? raw.accessories : [])
        .map((id) => real(id))
        .filter((id): id is string => Boolean(id)),
    },
    why: typeof raw.why === "string" ? raw.why : "",
    tip: typeof raw.tip === "string" && raw.tip.trim() ? raw.tip : undefined,
  };
}

export function resolveOutfits(parsed: OutfitsOutput | null, index: ShortIdIndex): ResolvedOutfit[] {
  if (!parsed || !Array.isArray(parsed.outfits)) return [];
  return parsed.outfits.map((raw) => resolveOutfit(raw, index));
}

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */

/**
 * Frozen. Every byte here is the cached prefix of every generation, so nothing
 * request-specific (weather, dates, counts, ids) may ever be interpolated in.
 */
export const OUTFIT_SYSTEM_PROMPT = `You are the personal stylist for one person. You compose outfits for a specific day out of that person's real wardrobe.

THE CLOSET IS THE WHOLE WORLD
Every piece you may use is listed in the user message, one per line, each with a short id such as t1, l2, o1, b3, d1, f2, a1. Refer to pieces only by those short ids. Never invent an id, never use a piece that is not listed, and never describe a garment the person does not own. If the closet cannot support a good outfit, return fewer outfits rather than a made-up one.

SLOTS
- Every outfit is either a top plus a bottom, or a single full-body piece (d ids). Never both.
- Footwear is required. Exactly one pair.
- A layer (l ids) and outerwear (o ids) are optional; follow the weather guidance in the user message. When outerwear is required, every outfit gets one. When it is "none", use none.
- Accessories: zero to two. They are punctuation, not the sentence.

HOW A GOOD OUTFIT IS BUILT
- Colour: at most one loud colour per outfit. Neutrals carry the look; a single saturated or patterned piece is the accent. Two patterns only when one is a quiet texture.
- Fit balance: pair a loose top with a straight or slim bottom, or a fitted top with a relaxed bottom. Avoid oversized on oversized unless the style explicitly asks for it.
- Formality: keep every piece inside the formality band given for the occasion. One step outside is a deliberate choice you must justify; two steps is wrong.
- Weather beats taste. A piece that leaves the person cold, soaked or overheated is a bad outfit however good it looks.

ACROSS THE SET
Give real variety: no two outfits in one response may share both their top and their bottom. Vary the shape, not just the colour. Order them best first.

VOICE
- "why": one or two sentences, second person, concrete and honest. Say what makes it work today - the temperature, the occasion, the colour or fit relationship. No hype, no filler, no restating the piece names as a list.
- "tip": optional, one line, only when it changes the result - how to wear it, not what it is. Skip it when you have nothing useful to say.
- Never mention brands, prices, trends, seasons as marketing, or yourself. Never write placeholder text.

Name each outfit in two to four plain words that describe the look, not the occasion.`;

/* ------------------------------------------------------------------ */
/* User message                                                        */
/* ------------------------------------------------------------------ */

export interface WeatherGuidance {
  outerwear: "required" | "optional" | "none";
  layer: "suggested" | "optional" | "none";
  notes: string[];
}

export interface StyleForPrompt {
  name: string;
  description: string;
  rules?: string | null;
}

export interface BuildOutfitPromptInput {
  candidates: Block[];
  request: GenerationRequest;
  style: StyleForPrompt | null;
  weatherContext: WeatherGuidance;
  /** Learned preferences. Phase 3 supplies these; empty for now. */
  tasteNotes?: string;
  /**
   * A pictured look to restyle, rendered by `inspirationForPrompt`. Set when
   * the request carries an inspoId (src/domain/inspo.ts).
   */
  inspiration?: string;
  /** Summary lines of pictures saved as references for the chosen style. */
  styleReferences?: string[];
  /** Appended verbatim on a retry after an unusable first answer. */
  correction?: string;
}

function round(n: number): string {
  return `${Math.round(n)}°`;
}

function describeWeather(w: WeatherSnapshot, guidance: WeatherGuidance): string[] {
  const lines: string[] = [];
  const head = [`${round(w.tempC)} ${WEATHER_CONDITION_LABELS[w.condition].toLowerCase()}`];
  if (w.feelsLikeC !== undefined) head.push(`feels like ${round(w.feelsLikeC)}`);
  if (w.lowC !== undefined) head.push(`low ${round(w.lowC)}`);
  if (w.precipitationChance !== undefined) head.push(`${Math.round(w.precipitationChance)}% chance of precipitation`);
  if (w.place) head.push(`in ${w.place}`);
  lines.push(head.join(", "));

  lines.push(
    `Outerwear: ${guidance.outerwear}. Layer: ${guidance.layer === "suggested" ? "suggested" : guidance.layer}.`,
  );
  for (const note of guidance.notes) lines.push(note);
  return lines;
}

export function buildUserMessage(input: BuildOutfitPromptInput, index: ShortIdIndex): string {
  const { request, style, weatherContext } = input;
  const sections: string[] = [];

  /* Closet */
  const closet: string[] = ["CLOSET — the only pieces you may use"];
  for (const category of CATEGORY_ORDER) {
    const rows = index.entries.filter((e) => e.block.category === category);
    if (rows.length === 0) continue;
    closet.push("", CATEGORY_LABELS[category]);
    for (const { shortId, block } of rows) {
      closet.push(`${shortId} · ${describeBlockForPrompt(block)}`);
    }
  }
  sections.push(closet.join("\n"));

  /* Weather */
  sections.push(["WEATHER", ...describeWeather(request.weather, weatherContext)].join("\n"));

  /* Occasion */
  const occasion = getOccasion(request.occasion);
  if (occasion) {
    sections.push(
      [
        "OCCASION",
        `${occasion.label} — ${occasion.hint}`,
        `Target formality ${occasion.formality[0]}–${occasion.formality[1]} of 5.`,
      ].join("\n"),
    );
  }

  /* Style */
  if (style) {
    const lines = ["STYLE", style.name];
    if (style.description.trim()) lines.push(style.description.trim());
    const rules = style.rules?.trim();
    if (rules) lines.push("Hard rules:", rules);
    sections.push(lines.join("\n"));
  }

  /* Reference looks saved for this style */
  const references = (input.styleReferences ?? [])
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (references.length) {
    sections.push(
      [
        "REFERENCE LOOKS FOR THIS STYLE",
        "Pictures the person saved as examples of this style. Use them for the mood, not as a shopping list.",
        ...references.map((line) => `- ${line}`),
      ].join("\n"),
    );
  }

  /* Inspiration picture */
  const inspiration = input.inspiration?.trim();
  if (inspiration) {
    sections.push(
      [
        "INSPIRATION — restyle this look from the closet",
        inspiration,
        "Rebuild this look out of the closet above. Capture the silhouette and the palette with pieces the person owns, substituting freely where they own nothing close. Never claim a piece that is not in the closet, and never describe the picture as if the person owned it.",
      ].join("\n"),
    );
  }

  /* Steer */
  if (request.steer) {
    sections.push(
      ["TODAY'S STEER — this takes priority over the general rules", request.steer].join("\n"),
    );
  }

  /* Pinned / excluded */
  const pinnedShort = request.pinned
    .map((id) => index.toShort.get(id))
    .filter((id): id is string => Boolean(id));
  if (pinnedShort.length) {
    sections.push(
      ["MUST INCLUDE", `Every outfit has to use: ${pinnedShort.join(", ")}.`].join("\n"),
    );
  }
  if (request.excluded.length) {
    sections.push(
      [
        "MUST NOT USE",
        `${request.excluded.length} piece${request.excluded.length === 1 ? "" : "s"} the person ruled out today ${request.excluded.length === 1 ? "has" : "have"} already been removed from the closet above. Do not reach for anything that is not listed.`,
      ].join("\n"),
    );
  }

  /* Taste */
  const taste = input.tasteNotes?.trim();
  if (taste) sections.push(["WHAT THIS PERSON TENDS TO LIKE", taste].join("\n"));

  /* Task */
  sections.push(
    `TASK\nCompose ${request.count} outfit${request.count === 1 ? "" : "s"} for today from the closet above, best first.`,
  );

  const correction = input.correction?.trim();
  if (correction) sections.push(["CORRECTION", correction].join("\n"));

  return sections.join("\n\n");
}

export interface BuiltOutfitPrompt {
  system: Anthropic.TextBlockParam[];
  user: string;
  index: ShortIdIndex;
}

export function buildOutfitPrompt(input: BuildOutfitPromptInput): BuiltOutfitPrompt {
  const index = buildShortIds(input.candidates);
  return {
    system: [
      {
        type: "text",
        text: OUTFIT_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    user: buildUserMessage(input, index),
    index,
  };
}
