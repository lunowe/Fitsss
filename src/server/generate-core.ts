import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { blocks, generations, outfitEvents, styles } from "@/db/schema";
import {
  SLOT_CATEGORY,
  filterClosetForWeather,
  inspirationForPrompt,
  validateOutfit,
  type Block,
  type Category,
  type GenerationRequest,
  type GenerationResult,
  type Inspo,
  type Outfit,
  type OutfitSlot,
  type OutfitSlots,
} from "@/domain";
import { matchToSlots } from "@/lib/inspo/match";
import { getLlmClient, isLlmConfigured, llmEffort, llmModel } from "@/lib/llm/client";
import {
  buildOutfitPrompt,
  outfitsOutputSchema,
  resolveOutfits,
  type StyleForPrompt,
} from "@/lib/llm/outfit-prompt";
import { isUuid } from "@/lib/llm/generation-request";
import { rowToBlock } from "@/server/blocks-queries";
import { loadAnalyzedInspo, styleReferenceLines } from "@/server/inspo-core";
import { tasteNotesForPrompt } from "@/server/taste-core";

/**
 * The generation engine. Lives outside the "use server" boundary so it can take
 * a user id: the server actions in generate.ts resolve the session and wrap it,
 * and scripts/try-generate.ts can drive it without a browser.
 */

export type GenerateErrorCode = "not-configured" | "empty-closet" | "too-few-pieces" | "llm" | "invalid";

export type GenerateOutfitsResult =
  | { ok: true; result: GenerationResult }
  | { ok: false; error: string; code: GenerateErrorCode };

export type SwapSlotInput = {
  generationId: string;
  outfitId: string;
  slot: OutfitSlot | "accessories";
  toBlockId: string;
  fromBlockId?: string;
};

export type SwapSlotResult = { ok: true; outfit: Outfit } | { ok: false; error: string };

const MAX_TOKENS = 4000;
const MAX_ACCESSORIES = 2;

type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  attempts: number;
};

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

function describeLlmError(error: unknown): { error: string; code: GenerateErrorCode } {
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      code: "not-configured",
      error: "The stylist could not sign in to the Claude API. Check that ANTHROPIC_API_KEY is set and valid.",
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { code: "llm", error: "The stylist is rate limited right now. Try again in a moment." };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { code: "llm", error: "Could not reach the Claude API. Check your connection and try again." };
  }
  if (error instanceof Anthropic.APIError) {
    return { code: "llm", error: `The Claude API returned an error (${error.status ?? "unknown"}).` };
  }
  return { code: "llm", error: "The stylist could not finish. Try again." };
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

async function loadActiveBlocks(userId: string): Promise<Block[]> {
  const rows = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.userId, userId), isNull(blocks.archivedAt)));
  return rows.map(rowToBlock);
}

async function loadStyle(userId: string, styleId: string | undefined): Promise<StyleForPrompt | null> {
  if (!styleId || !isUuid(styleId)) return null;
  const [row] = await db
    .select({ name: styles.name, description: styles.description, rules: styles.rules })
    .from(styles)
    .where(and(eq(styles.id, styleId), eq(styles.userId, userId)))
    .limit(1);
  return row ? { name: row.name, description: row.description, rules: row.rules } : null;
}

/* ------------------------------------------------------------------ */
/* LLM_MOCK — local development without an API key                     */
/* ------------------------------------------------------------------ */

type RawOutfit = { name: string; slots: Record<string, unknown>; why: string };

/**
 * Deterministic stand-in for the model, used only when `LLM_MOCK=1`. It rotates
 * through the weather-filtered candidates so the outfits differ, and adds a
 * layer or outerwear when the weather context asks for one. The outfits it
 * returns still go through `validateOutfit` and are persisted exactly like a
 * real generation, with model "mock".
 */
function buildMockOutfits(
  candidates: Block[],
  request: GenerationRequest,
  weatherContext: ReturnType<typeof filterClosetForWeather>,
  preferred: Partial<OutfitSlots> = {},
): RawOutfit[] {
  const inCategory = (category: Category) => candidates.filter((b) => b.category === category);
  const tops = inCategory("top");
  const bottoms = inCategory("bottom");
  const shoes = inCategory("footwear");
  const layers = inCategory("layer");
  const outerwear = inCategory("outerwear");
  const accessories = inCategory("accessory");
  const fullbody = inCategory("fullbody");

  const at = (list: Block[], i: number): string | undefined =>
    list.length ? list[i % list.length].id : undefined;

  const available = new Set(candidates.map((b) => b.id));
  /**
   * Blocks the inspiration match already picked out. Only the first mock
   * outfit uses them, so a restyle still shows variety rather than the same
   * four pieces three times.
   */
  const prefer = (slot: keyof Omit<OutfitSlots, "accessories">, i: number): string | undefined => {
    if (i !== 0) return undefined;
    const id = preferred[slot];
    return id && available.has(id) ? id : undefined;
  };

  const outfits: RawOutfit[] = [];
  for (let i = 0; i < request.count; i++) {
    const preferredAccessories = (i === 0 ? (preferred.accessories ?? []) : []).filter((id) =>
      available.has(id),
    );
    const slots: Record<string, unknown> = {
      footwear: prefer("footwear", i) ?? at(shoes, i),
      accessories: (preferredAccessories.length
        ? preferredAccessories.slice(0, MAX_ACCESSORIES)
        : [at(accessories, i)]
      ).filter((id): id is string => Boolean(id)),
    };
    if ((!tops.length || !bottoms.length) && fullbody.length) {
      slots.fullbody = prefer("fullbody", i) ?? at(fullbody, i);
    } else {
      slots.top = prefer("top", i) ?? at(tops, i);
      slots.bottom = prefer("bottom", i) ?? at(bottoms, i);
    }
    if (weatherContext.layer === "suggested") slots.layer = prefer("layer", i) ?? at(layers, i);
    if (weatherContext.outerwear === "required") {
      slots.outerwear = prefer("outerwear", i) ?? at(outerwear, i);
    }

    // Pinned pieces must appear in every outfit: drop them into their slot.
    for (const id of request.pinned) {
      const pinned = candidates.find((b) => b.id === id);
      if (!pinned) continue;
      if (pinned.category === "accessory") {
        const acc = slots.accessories as string[];
        if (!acc.includes(id)) acc.unshift(id);
      } else if (pinned.category === "fullbody") {
        slots.fullbody = id;
        delete slots.top;
        delete slots.bottom;
      } else {
        slots[pinned.category] = id;
        if (pinned.category === "top" || pinned.category === "bottom") delete slots.fullbody;
      }
    }

    outfits.push({ name: `Mock look ${i + 1}`, slots, why: "Mock outfit: LLM_MOCK is on." });
  }
  return outfits;
}

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

export async function generateOutfitsForUser(
  userId: string,
  request: GenerationRequest,
  options: { tasteNotes?: string } = {},
): Promise<GenerateOutfitsResult> {
  const mock = process.env.LLM_MOCK === "1";

  if (!mock && !isLlmConfigured()) {
    return {
      ok: false,
      code: "not-configured",
      error: "No Claude API key yet. Add ANTHROPIC_API_KEY to .env.local to generate outfits.",
    };
  }

  const active = await loadActiveBlocks(userId);
  if (active.length === 0) {
    return { ok: false, code: "empty-closet", error: "Your closet is empty. Add a few pieces first." };
  }

  const weatherContext = filterClosetForWeather(active, request.weather);

  const excluded = new Set(request.excluded);
  const byId = new Map(active.map((b) => [b.id, b]));
  const chosen = new Map<string, Block>();
  for (const block of weatherContext.wearable) {
    if (!excluded.has(block.id)) chosen.set(block.id, block);
  }
  // Pinned pieces survive the weather filter: the user asked for them on purpose.
  for (const id of request.pinned) {
    const block = byId.get(id);
    if (block) chosen.set(block.id, block);
  }

  const candidates = [...chosen.values()];
  const filteredOutCount = Math.max(0, active.length - candidates.length);

  const has = (category: Category) => candidates.some((b) => b.category === category);
  if (!has("footwear") || !((has("top") && has("bottom")) || has("fullbody"))) {
    const missing: string[] = [];
    if (!has("footwear")) missing.push("shoes");
    if (!has("fullbody")) {
      if (!has("top")) missing.push("a top");
      if (!has("bottom")) missing.push("a bottom");
    }
    return {
      ok: false,
      code: "too-few-pieces",
      error: `Not enough to work with today: nothing in the closet covers ${missing.join(" and ")} for this weather. Add pieces, or set the weather by hand.`,
    };
  }

  const style = await loadStyle(userId, request.styleId);

  // Phase 4 (inspiration): a restyle is a normal generation with the pictured
  // look described in the prompt. The analysis has to exist already — the
  // generator never calls the vision model itself.
  let inspo: Inspo | null = null;
  if (request.inspoId) {
    inspo = await loadAnalyzedInspo(userId, request.inspoId);
    if (!inspo?.analysis) {
      return {
        ok: false,
        code: "invalid",
        error: "That picture has not been read yet. Open it and analyse it first.",
      };
    }
  }
  const styleReferences =
    request.styleId && isUuid(request.styleId) ? await styleReferenceLines(userId, request.styleId) : [];

  // Phase 3 (taste memory): fall back to the learned notes when the caller
  // passed none. Resolved on the mock path too, so LLM_MOCK exercises it.
  const tasteNotes =
    options.tasteNotes ?? (await tasteNotesForPrompt(userId, request.styleId ?? null));
  const candidateMap = new Map(candidates.map((b) => [b.id, b]));
  const model = mock ? "mock" : llmModel();
  const effort = llmEffort();

  const usage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    attempts: 0,
  };

  let outfits: Outfit[] = [];
  let lastProblems: string[] = [];

  if (mock) {
    const preferred =
      inspo?.analysis && inspo.match ? matchToSlots(inspo.match, inspo.analysis) : {};
    for (const raw of buildMockOutfits(candidates, request, weatherContext, preferred)) {
      const validated = validateOutfit(raw, candidateMap, request.pinned);
      if (validated.ok) outfits.push(validated.outfit);
    }
    outfits = outfits.slice(0, request.count);
  }

  for (let attempt = 0; !mock && attempt < 2 && outfits.length === 0; attempt++) {
    const prompt = buildOutfitPrompt({
      candidates,
      request,
      style,
      weatherContext,
      tasteNotes,
      inspiration: inspo?.analysis ? inspirationForPrompt(inspo.analysis) : undefined,
      styleReferences,
      correction:
        attempt === 0
          ? undefined
          : `Your previous answer could not be used: ${lastProblems.slice(0, 4).join("; ") || "no usable outfit came back"}. Use only the short ids listed above, give every outfit footwear and either a top and a bottom or one full-body piece, and return ${request.count} outfit${request.count === 1 ? "" : "s"}.`,
    });

    let message;
    try {
      usage.attempts += 1;
      message = await getLlmClient().messages.parse({
        model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: {
          effort,
          format: zodOutputFormat(outfitsOutputSchema),
        },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
    } catch (error) {
      return { ok: false, ...describeLlmError(error) };
    }

    usage.inputTokens += message.usage.input_tokens ?? 0;
    usage.outputTokens += message.usage.output_tokens ?? 0;
    usage.cacheReadInputTokens += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheCreationInputTokens += message.usage.cache_creation_input_tokens ?? 0;

    if (message.stop_reason === "refusal") {
      return { ok: false, code: "llm", error: "The stylist declined this request." };
    }

    const problems: string[] = [];
    const accepted: Outfit[] = [];
    for (const resolved of resolveOutfits(message.parsed_output, prompt.index)) {
      const validated = validateOutfit(resolved, candidateMap, request.pinned);
      if (validated.ok) accepted.push(validated.outfit);
      else problems.push(`"${resolved.name || "unnamed"}": ${validated.errors.join(", ")}`);
    }

    if (problems.length) {
      console.warn(`[generate] dropped ${problems.length} outfit(s): ${problems.join(" | ")}`);
    }
    lastProblems = problems;
    outfits = accepted.slice(0, request.count);
  }

  if (outfits.length === 0) {
    return {
      ok: false,
      code: "llm",
      error: "The stylist could not put together a wearable outfit from these pieces. Try a different occasion or fewer pins.",
    };
  }

  const [row] = await db
    .insert(generations)
    .values({
      userId,
      request,
      outfits,
      filteredOutCount,
      model,
      usage,
    })
    .returning({ id: generations.id, createdAt: generations.createdAt });

  return {
    ok: true,
    result: {
      id: row.id,
      request,
      outfits,
      filteredOutCount,
      model,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Swap a single slot (no model call)                                  */
/* ------------------------------------------------------------------ */

export async function swapSlotForUser(userId: string, input: SwapSlotInput): Promise<SwapSlotResult> {
  const { generationId, outfitId, slot, toBlockId, fromBlockId } = input ?? {};

  if (!isUuid(generationId) || !isUuid(toBlockId)) {
    return { ok: false, error: "That swap does not look right." };
  }
  if (typeof outfitId !== "string" || !outfitId) {
    return { ok: false, error: "That outfit is no longer available." };
  }
  const isAccessories = slot === "accessories";
  if (!isAccessories && !(slot in SLOT_CATEGORY)) {
    return { ok: false, error: "Unknown slot." };
  }

  const [generation] = await db
    .select({ id: generations.id, outfits: generations.outfits, request: generations.request })
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.userId, userId)))
    .limit(1);

  if (!generation) return { ok: false, error: "That set of outfits is gone." };

  const outfits = (Array.isArray(generation.outfits) ? generation.outfits : []) as Outfit[];
  const target = outfits.find((o) => o?.id === outfitId);
  if (!target) return { ok: false, error: "That outfit is no longer available." };

  const [blockRow] = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, toBlockId), eq(blocks.userId, userId)))
    .limit(1);
  if (!blockRow) return { ok: false, error: "That piece is not in your closet." };

  const block = rowToBlock(blockRow);
  const wanted: Category = isAccessories ? "accessory" : SLOT_CATEGORY[slot as OutfitSlot];
  if (block.category !== wanted) {
    return { ok: false, error: `${block.label} cannot go in that slot.` };
  }

  const slots = { ...target.slots, accessories: [...(target.slots.accessories ?? [])] };

  if (isAccessories) {
    if (fromBlockId) {
      const at = slots.accessories.indexOf(fromBlockId);
      if (at >= 0) slots.accessories[at] = toBlockId;
      else if (!slots.accessories.includes(toBlockId)) slots.accessories.push(toBlockId);
    } else if (!slots.accessories.includes(toBlockId)) {
      slots.accessories.push(toBlockId);
    }
    slots.accessories = [...new Set(slots.accessories)].slice(0, MAX_ACCESSORIES);
  } else {
    const key = slot as OutfitSlot;
    slots[key] = toBlockId;
    // A full-body piece and a top/bottom pair are mutually exclusive.
    if (key === "fullbody") {
      slots.top = undefined;
      slots.bottom = undefined;
    } else if (key === "top" || key === "bottom") {
      slots.fullbody = undefined;
    }
  }

  const updated: Outfit = { ...target, slots };
  const nextOutfits = outfits.map((o) => (o.id === outfitId ? updated : o));

  const occasion =
    typeof (generation.request as { occasion?: unknown } | null)?.occasion === "string"
      ? ((generation.request as { occasion: string }).occasion)
      : null;
  const styleId = (generation.request as { styleId?: unknown } | null)?.styleId;

  await db.transaction(async (tx) => {
    await tx.update(generations).set({ outfits: nextOutfits }).where(eq(generations.id, generationId));
    await tx.insert(outfitEvents).values({
      userId,
      type: "swapped",
      outfit: updated,
      detail: { slot, fromId: fromBlockId ?? null, toId: toBlockId },
      styleId: isUuid(styleId) ? styleId : null,
      occasion,
      generationId,
    });
  });

  return { ok: true, outfit: updated };
}
