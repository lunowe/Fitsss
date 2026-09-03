import type { Block, Category } from "./types";

/* ------------------------------------------------------------------ */
/* Occasions                                                           */
/* ------------------------------------------------------------------ */

export const OCCASIONS = [
  { id: "everyday", label: "Everyday", hint: "Errands, friends, a normal day", formality: [1, 3] },
  { id: "work", label: "Work", hint: "Office or meetings", formality: [3, 4] },
  { id: "smart", label: "Smart", hint: "Dinner, event, dressed up", formality: [4, 5] },
  { id: "date", label: "Date", hint: "Put together but relaxed", formality: [2, 4] },
  { id: "night-out", label: "Night out", hint: "Bar, concert, late", formality: [2, 4] },
  { id: "active", label: "Active", hint: "Walk, gym, outdoors", formality: [1, 2] },
  { id: "lounge", label: "Lounge", hint: "Home, comfort first", formality: [1, 2] },
  { id: "travel", label: "Travel", hint: "Long day, layers, comfort", formality: [1, 3] },
] as const satisfies readonly { id: string; label: string; hint: string; formality: readonly [number, number] }[];

export type OccasionId = (typeof OCCASIONS)[number]["id"];

export function getOccasion(id: string) {
  return OCCASIONS.find((o) => o.id === id);
}

export function isOccasionId(value: string): value is OccasionId {
  return OCCASIONS.some((o) => o.id === value);
}

/* ------------------------------------------------------------------ */
/* Weather                                                             */
/* ------------------------------------------------------------------ */

export const WEATHER_CONDITIONS = ["clear", "cloudy", "rain", "snow", "wind", "storm"] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export const WEATHER_CONDITION_LABELS: Record<WeatherCondition, string> = {
  clear: "Clear",
  cloudy: "Cloudy",
  rain: "Rain",
  snow: "Snow",
  wind: "Windy",
  storm: "Storm",
};

/** What the generator knows about today's weather. Either from Open-Meteo or set by hand. */
export interface WeatherSnapshot {
  /** Air temperature in °C used for decisions (daytime high, or the user's override). */
  tempC: number;
  /** Apparent temperature if known. */
  feelsLikeC?: number;
  /** Daytime low, if known. */
  lowC?: number;
  /** 0..100 */
  precipitationChance?: number;
  condition: WeatherCondition;
  /** Where the numbers came from. */
  source: "forecast" | "manual";
  /** Human place name when from a forecast, e.g. "Leipzig". */
  place?: string;
}

/** Warmth band [min, max] (1..5) that fits a given apparent temperature. */
export function warmthBandForTemp(tempC: number): [number, number] {
  if (tempC >= 26) return [1, 1];
  if (tempC >= 20) return [1, 2];
  if (tempC >= 14) return [2, 3];
  if (tempC >= 8) return [3, 4];
  if (tempC >= 2) return [4, 5];
  return [5, 5];
}

export function effectiveTemp(w: WeatherSnapshot): number {
  return w.feelsLikeC ?? w.tempC;
}

/**
 * Hard filter of the closet for a weather snapshot. Runs before any LLM call,
 * so a puffer never appears in a heatwave outfit no matter what the model thinks.
 * Returns the wearable blocks plus which optional slots are relevant today.
 */
export function filterClosetForWeather(blocks: Block[], weather: WeatherSnapshot): {
  wearable: Block[];
  outerwear: "required" | "optional" | "none";
  layer: "suggested" | "optional" | "none";
  notes: string[];
} {
  const t = effectiveTemp(weather);
  const [, bandMax] = warmthBandForTemp(t);
  const wet = weather.condition === "rain" || weather.condition === "storm" || (weather.precipitationChance ?? 0) >= 50;
  const notes: string[] = [];

  const outerwear: "required" | "optional" | "none" = t < 12 ? "required" : t < 20 ? "optional" : "none";
  const layer: "suggested" | "optional" | "none" = t < 16 ? "suggested" : t < 23 ? "optional" : "none";

  const wearable = blocks.filter((b) => {
    if (b.archivedAt) return false;
    switch (b.category) {
      case "outerwear":
        if (outerwear === "none") return false;
        // Coats sized for the band: allow one step warmer than the band for cold-sensitive users.
        return b.warmth <= bandMax + 1 && b.warmth >= Math.max(1, bandMax - 2);
      case "layer":
        if (layer === "none") return false;
        return b.warmth <= bandMax + 1;
      case "top":
        // Heavy tops (thick long sleeves) only when it is genuinely cool.
        return b.warmth <= Math.max(2, bandMax + 1);
      case "bottom":
        // Shorts and skirts only when warm.
        if (b.warmth <= 1 && t < 19) return false;
        return true;
      case "footwear":
        if (b.typeId === "sandals" && (t < 22 || wet)) return false;
        if (b.typeId === "boots" && t >= 22) return false;
        return true;
      case "accessory":
        if (b.typeId === "beanie" && t >= 12) return false;
        if (b.typeId === "scarf" && t >= 14) return false;
        if (b.typeId === "sunglasses" && (wet || weather.condition === "cloudy")) return false;
        return true;
      case "fullbody":
        return b.warmth <= bandMax + 1;
      default:
        return true;
    }
  });

  if (wet) notes.push("Rain is likely: prefer closed shoes and a jacket that handles water.");
  if (weather.condition === "wind") notes.push("It is windy: a wind-blocking outer layer helps.");
  if (weather.lowC !== undefined && weather.lowC < t - 8) notes.push("Big swing between day and evening: suggest a layer that can come off.");
  return { wearable, outerwear, layer, notes };
}

/* ------------------------------------------------------------------ */
/* Outfits                                                             */
/* ------------------------------------------------------------------ */

export const OUTFIT_SLOTS = ["top", "layer", "outerwear", "bottom", "fullbody", "footwear"] as const;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

/** Which block category fills a slot. Accessories are a list, handled separately. */
export const SLOT_CATEGORY: Record<OutfitSlot, Category> = {
  top: "top",
  layer: "layer",
  outerwear: "outerwear",
  bottom: "bottom",
  fullbody: "fullbody",
  footwear: "footwear",
};

/** An outfit as stored and displayed: block ids per slot. */
export interface OutfitSlots {
  top?: string;
  layer?: string;
  outerwear?: string;
  bottom?: string;
  fullbody?: string;
  footwear: string;
  accessories: string[];
}

export interface Outfit {
  /** Client-side id, stable within one generation result. */
  id: string;
  name: string;
  slots: OutfitSlots;
  /** One or two sentences: why this works today. */
  why: string;
  /** Optional styling tip: how to wear it (tuck, roll, unbutton). */
  tip?: string;
}

export interface GenerationRequest {
  styleId?: string;
  occasion: OccasionId;
  weather: WeatherSnapshot;
  /** Free-text steer for today, e.g. "more relaxed", "wear the new boots". */
  steer?: string;
  /** How many outfits to return. 1..5. */
  count: number;
  /** Block ids that must appear. */
  pinned: string[];
  /** Block ids that must not appear. */
  excluded: string[];
  /** Restyle in the spirit of a saved inspiration picture (src/domain/inspo.ts). */
  inspoId?: string;
}

export interface GenerationResult {
  id: string;
  request: GenerationRequest;
  outfits: Outfit[];
  /** Hard-filter summary shown to the user, e.g. "Left out 6 pieces too warm for 24°". */
  filteredOutCount: number;
  model: string;
  createdAt: string;
}

/** Every block id referenced by an outfit, in display order. */
export function outfitBlockIds(slots: OutfitSlots): string[] {
  const ids: string[] = [];
  for (const s of ["outerwear", "layer", "top", "fullbody", "bottom", "footwear"] as const) {
    const id = slots[s];
    if (id) ids.push(id);
  }
  ids.push(...slots.accessories);
  return ids;
}

/**
 * Validates a raw outfit from the model against the candidate blocks.
 * Returns the cleaned outfit or a list of problems. Unknown ids are dropped;
 * missing required slots are errors.
 */
export function validateOutfit(
  raw: { name?: unknown; slots?: unknown; why?: unknown; tip?: unknown },
  candidates: Map<string, Block>,
  pinned: string[] = [],
): { ok: true; outfit: Outfit } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const s = (typeof raw.slots === "object" && raw.slots !== null ? raw.slots : {}) as Record<string, unknown>;

  const pick = (slot: OutfitSlot): string | undefined => {
    const id = s[slot];
    if (typeof id !== "string" || !id) return undefined;
    const b = candidates.get(id);
    if (!b) {
      errors.push(`${slot}: unknown block ${id}`);
      return undefined;
    }
    if (b.category !== SLOT_CATEGORY[slot]) {
      errors.push(`${slot}: ${id} is a ${b.category}, not a ${SLOT_CATEGORY[slot]}`);
      return undefined;
    }
    return id;
  };

  const slots: OutfitSlots = {
    top: pick("top"),
    layer: pick("layer"),
    outerwear: pick("outerwear"),
    bottom: pick("bottom"),
    fullbody: pick("fullbody"),
    footwear: pick("footwear") ?? "",
    accessories: [],
  };
  const acc = Array.isArray(s.accessories) ? s.accessories : [];
  for (const id of acc) {
    if (typeof id !== "string") continue;
    const b = candidates.get(id);
    if (b && b.category === "accessory" && !slots.accessories.includes(id)) slots.accessories.push(id);
  }

  if (!slots.footwear) errors.push("footwear is required");
  if (slots.fullbody) {
    slots.top = undefined;
    slots.bottom = undefined;
  } else if (!slots.top || !slots.bottom) {
    errors.push("an outfit needs a top and a bottom, or a full-body piece");
  }
  const used = new Set(outfitBlockIds(slots));
  for (const id of pinned) if (!used.has(id)) errors.push(`pinned block ${id} is missing`);

  if (errors.length) return { ok: false, errors };
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 60) : "Outfit";
  const why = typeof raw.why === "string" ? raw.why.trim().slice(0, 400) : "";
  const tip = typeof raw.tip === "string" && raw.tip.trim() ? raw.tip.trim().slice(0, 200) : undefined;
  return { ok: true, outfit: { id: crypto.randomUUID(), name, slots, why, tip } };
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export const OUTFIT_EVENT_TYPES = ["saved", "liked", "disliked", "worn", "swapped", "unsaved"] as const;
export type OutfitEventType = (typeof OUTFIT_EVENT_TYPES)[number];

export const DISLIKE_REASONS = [
  { id: "too-warm", label: "Too warm" },
  { id: "too-cold", label: "Too cold" },
  { id: "too-dressy", label: "Too dressy" },
  { id: "too-casual", label: "Too casual" },
  { id: "colors", label: "Colors clash" },
  { id: "not-my-style", label: "Not my style" },
  { id: "wrong-piece", label: "One piece is off" },
] as const;
export type DislikeReason = (typeof DISLIKE_REASONS)[number]["id"];

/* ------------------------------------------------------------------ */
/* Compact closet listing for prompts                                  */
/* ------------------------------------------------------------------ */

/**
 * One line per block for the prompt. Short ids keep the prompt small:
 * the caller passes a map from short id to real id and back.
 */
export function describeBlockForPrompt(b: Block): string {
  const bits = [b.label];
  if (b.quantity > 1) bits.push(`×${b.quantity}`);
  if (b.nickname) bits.push(`"${b.nickname}"`);
  bits.push(`warmth ${b.warmth}/5`, `formality ${b.formality}/5`);
  if (b.notes) bits.push(`note: ${b.notes}`);
  return bits.join(" · ");
}
