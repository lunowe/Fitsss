import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { ownedRefs } from "@/server/owned-refs";
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
  type WeatherSnapshot,
  isOccasionId,
} from "@/domain";
import { matchToSlots } from "@/lib/inspo/match";
import {
  OUTFIT_SYSTEM_PROMPT,
  buildOutfitPrompt,
  outfitsOutputSchema,
  resolveOutfits,
  type StyleForPrompt,
} from "@/lib/llm/outfit-prompt";
import { callStructured, providerConfigured, type StructuredErrorCode } from "@/lib/llm/provider";
import { isUuid, validateWeatherSnapshot } from "@/lib/llm/generation-request";
import { rowToBlock } from "@/server/blocks-queries";
import { loadAnalyzedInspo, styleReferenceLines } from "@/server/inspo-core";
import { getLlmSettingsForUser } from "@/server/settings-queries";
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

/** Provider codes, narrowed to the two this screen distinguishes. */
function toGenerateCode(code: StructuredErrorCode): GenerateErrorCode {
  return code === "not-configured" ? "not-configured" : "llm";
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export async function loadActiveBlocks(userId: string): Promise<Block[]> {
  const rows = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.userId, userId), isNull(blocks.archivedAt)));
  return rows.map(rowToBlock);
}

export async function loadStyle(userId: string, styleId: string | undefined): Promise<StyleForPrompt | null> {
  if (!styleId || !isUuid(styleId)) return null;
  const [row] = await db
    .select({ name: styles.name, description: styles.description, rules: styles.rules })
    .from(styles)
    // Deleting a style archives it; an archived style no longer steers anything.
    .where(and(eq(styles.id, styleId), eq(styles.userId, userId), isNull(styles.archivedAt)))
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
/* Restyle a picture                                                   */
/* ------------------------------------------------------------------ */

/** A restyle's weather when the caller has no forecast to hand: a mild grey day. */
const RESTYLE_FALLBACK_WEATHER: WeatherSnapshot = { tempC: 18, condition: "cloudy", source: "manual" };
const RESTYLE_DEFAULT_COUNT = 2;

/**
 * Outfits from the closet in the spirit of a saved picture: a normal
 * generation with the pictured look described in the prompt. Takes
 * `{ inspoId, count?, occasion?, weather? }`; a missing or unknown occasion
 * is "everyday".
 */
export async function restyleFromInspoForUser(userId: string, input: unknown): Promise<GenerateOutfitsResult> {
  const record =
    input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const inspoId = typeof record.inspoId === "string" ? record.inspoId.trim().toLowerCase() : "";
  if (!isUuid(inspoId)) return { ok: false, code: "invalid", error: "That picture is gone." };

  const occasion =
    typeof record.occasion === "string" && isOccasionId(record.occasion) ? record.occasion : "everyday";

  let weather = RESTYLE_FALLBACK_WEATHER;
  if (record.weather !== undefined && record.weather !== null) {
    const checked = validateWeatherSnapshot(record.weather);
    if (!checked.ok) return { ok: false, code: "invalid", error: checked.errors[0] };
    weather = checked.weather;
  }

  const rawCount = typeof record.count === "number" && Number.isFinite(record.count) ? record.count : RESTYLE_DEFAULT_COUNT;
  const count = Math.min(5, Math.max(1, Math.round(rawCount)));

  return generateOutfitsForUser(userId, { occasion, weather, count, pinned: [], excluded: [], inspoId });
}

/* ------------------------------------------------------------------ */
/* Generate                                                            */
/* ------------------------------------------------------------------ */

export async function generateOutfitsForUser(
  userId: string,
  request: GenerationRequest,
  options: { tasteNotes?: string } = {},
): Promise<GenerateOutfitsResult> {
  const llm = await getLlmSettingsForUser(userId);
  const mock = llm.provider === "mock";

  if (!mock) {
    const configured = providerConfigured(llm);
    if (!configured.ok) return { ok: false, code: "not-configured", error: configured.error };
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
  // A pin that is not (or no longer) an active piece of this closet can never
  // be satisfied: say so before paying for a model call that must fail.
  if (request.pinned.some((id) => !byId.has(id))) {
    return {
      ok: false,
      code: "invalid",
      error: "A pinned piece is no longer in your closet. Unpin it and try again.",
    };
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
  // A style id that isn't this user's (or was deleted) is dropped, so the
  // stored request — and every event derived from it — only names their own.
  if (request.styleId && !style) request = { ...request, styleId: undefined };

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
  // Overwritten with the id the provider reports, which can differ from the one
  // asked for (OpenRouter resolves ":floor" and friends to a concrete model).
  let model = mock ? "mock" : llm.models.outfits;

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

    usage.attempts += 1;
    const answer = await callStructured(
      {
        task: "outfits",
        system: OUTFIT_SYSTEM_PROMPT,
        user: prompt.user,
        schema: outfitsOutputSchema,
        schemaName: "outfits",
        maxTokens: MAX_TOKENS,
      },
      llm,
    );

    if (!answer.ok) {
      // A malformed answer is worth one more go with a correction; a refusal or
      // a rate limit will say the same thing twice.
      if (answer.code === "invalid-output" && attempt === 0) {
        lastProblems = [answer.error];
        continue;
      }
      return { ok: false, code: toGenerateCode(answer.code), error: answer.error };
    }

    model = answer.model;
    usage.inputTokens += answer.usage.inputTokens;
    usage.outputTokens += answer.usage.outputTokens;
    usage.cacheReadInputTokens += answer.usage.cacheReadInputTokens ?? 0;
    usage.cacheCreationInputTokens += answer.usage.cacheCreationInputTokens ?? 0;

    const problems: string[] = [];
    const accepted: Outfit[] = [];
    for (const resolved of resolveOutfits(answer.value, prompt.index)) {
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

  // Read, change and write the generation in one transaction with its row
  // locked: two swaps on different cards of one set would otherwise both read
  // the same outfits, and the second write would undo the first.
  return db.transaction(async (tx): Promise<SwapSlotResult> => {
    const [generation] = await tx
      .select({ id: generations.id, outfits: generations.outfits, request: generations.request })
      .from(generations)
      .where(and(eq(generations.id, generationId), eq(generations.userId, userId)))
      .for("update")
      .limit(1);

    if (!generation) return { ok: false, error: "That set of outfits is gone." };

    const outfits = (Array.isArray(generation.outfits) ? generation.outfits : []) as Outfit[];
    const target = outfits.find((o) => o?.id === outfitId);
    if (!target) return { ok: false, error: "That outfit is no longer available." };

    const [blockRow] = await tx
      .select()
      .from(blocks)
      .where(and(eq(blocks.id, toBlockId), eq(blocks.userId, userId), isNull(blocks.archivedAt)))
      .limit(1);
    if (!blockRow) return { ok: false, error: "That piece is not in your closet." };

    const block = rowToBlock(blockRow);
    const wanted: Category = isAccessories ? "accessory" : SLOT_CATEGORY[slot as OutfitSlot];
    if (block.category !== wanted) {
      return { ok: false, error: `${block.label} cannot go in that slot.` };
    }

    const slots = { ...target.slots, accessories: [...(target.slots.accessories ?? [])] };
    // Swapping an accessory for itself changes nothing: no write, no event.
    if (isAccessories && toBlockId === fromBlockId && slots.accessories.includes(toBlockId)) {
      return { ok: true, outfit: target };
    }
    if (isAccessories && toBlockId !== fromBlockId && slots.accessories.includes(toBlockId)) {
      return { ok: false, error: `${block.label} is already in this outfit.` };
    }

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

    // Swapping a top into a dress outfit (or a dress into a top-and-bottom
    // one) must still leave a wearable outfit; the app never offers the
    // former, but the API must not store an outfit no one can save.
    if (!slots.footwear || !(slots.fullbody || (slots.top && slots.bottom))) {
      return { ok: false, error: "That would leave the outfit without a top and a bottom, or a full-body piece." };
    }

    const updated: Outfit = { ...target, slots };
    const nextOutfits = outfits.map((o) => (o.id === outfitId ? updated : o));

    const occasion =
      typeof (generation.request as { occasion?: unknown } | null)?.occasion === "string"
        ? ((generation.request as { occasion: string }).occasion)
        : null;
    // Only the user's own style, whatever an older stored request says.
    const { styleId } = await ownedRefs(userId, {
      styleId: (generation.request as { styleId?: unknown } | null)?.styleId,
    });

      await tx.update(generations).set({ outfits: nextOutfits }).where(eq(generations.id, generationId));
      await tx.insert(outfitEvents).values({
        userId,
        type: "swapped",
        outfit: updated,
        detail: { slot, fromId: fromBlockId ?? null, toId: toBlockId },
        styleId,
        occasion,
        generationId,
      });

      return { ok: true, outfit: updated };
  });
}
