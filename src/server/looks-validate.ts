/**
 * Pure validation for saved looks. Split out of `looks.ts` because a
 * `"use server"` module may only export async functions. Unit tested.
 */

import {
  WEATHER_CONDITIONS,
  isOccasionId,
  outfitBlockIds,
  type Outfit,
  type OutfitSlots,
  type WeatherCondition,
  type WeatherSnapshot,
} from "@/domain";

export const MAX_LOOK_NAME = 60;
const MAX_WHY = 400;
const MAX_TIP = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SaveLookInput {
  outfit: Outfit;
  styleId?: string;
  occasion?: string;
  weather?: WeatherSnapshot;
  generationId?: string;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function optionalId(value: unknown): string | undefined {
  return typeof value === "string" && UUID_RE.test(value) ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A look's name: required, trimmed, capped. */
export function validateLookName(name: unknown): Validated<string> {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return { ok: false, errors: ["A look needs a name"] };
  if (trimmed.length > MAX_LOOK_NAME) {
    return { ok: false, errors: [`Keep the name under ${MAX_LOOK_NAME} characters`] };
  }
  return { ok: true, value: trimmed };
}

/** Keeps only the fields the app stores, so nothing extra reaches jsonb. */
export function normalizeWeather(raw: unknown): WeatherSnapshot | undefined {
  const w = record(raw);
  const tempC = optionalNumber(w.tempC);
  if (tempC === undefined) return undefined;
  const condition = WEATHER_CONDITIONS.includes(w.condition as WeatherCondition)
    ? (w.condition as WeatherCondition)
    : "clear";
  return {
    tempC,
    feelsLikeC: optionalNumber(w.feelsLikeC),
    lowC: optionalNumber(w.lowC),
    precipitationChance: optionalNumber(w.precipitationChance),
    condition,
    source: w.source === "manual" ? "manual" : "forecast",
    place: typeof w.place === "string" && w.place.trim() ? w.place.trim().slice(0, 60) : undefined,
  };
}

/**
 * Structural check of an outfit's slots: block ids must be strings, footwear is
 * required, and the outfit needs a top and a bottom or one full-body piece.
 * Ownership of the ids is checked against the database by the caller.
 */
export function validateOutfitSlots(raw: unknown): Validated<OutfitSlots> {
  const s = record(raw);
  const pick = (key: "top" | "layer" | "outerwear" | "bottom" | "fullbody") => {
    const id = s[key];
    return typeof id === "string" && id ? id : undefined;
  };

  const footwear = typeof s.footwear === "string" ? s.footwear : "";
  const fullbody = pick("fullbody");
  const slots: OutfitSlots = {
    top: fullbody ? undefined : pick("top"),
    layer: pick("layer"),
    outerwear: pick("outerwear"),
    bottom: fullbody ? undefined : pick("bottom"),
    fullbody,
    footwear,
    accessories: [],
  };

  const seen = new Set<string>(
    [slots.outerwear, slots.layer, slots.top, slots.fullbody, slots.bottom, footwear].filter(
      (id): id is string => Boolean(id),
    ),
  );
  for (const id of Array.isArray(s.accessories) ? s.accessories : []) {
    if (typeof id === "string" && id && !seen.has(id)) {
      seen.add(id);
      slots.accessories.push(id);
    }
  }

  const errors: string[] = [];
  if (!footwear) errors.push("An outfit needs shoes");
  if (!slots.fullbody && (!slots.top || !slots.bottom)) {
    errors.push("An outfit needs a top and a bottom, or a full-body piece");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: slots };
}

/** Validates the payload `saveLook` receives from the client. */
export function validateSaveLookInput(input: unknown): Validated<SaveLookInput> {
  const raw = record(input);
  const outfitRaw = record(raw.outfit);
  const slots = validateOutfitSlots(outfitRaw.slots);
  if (!slots.ok) return slots;

  const name = typeof outfitRaw.name === "string" && outfitRaw.name.trim()
    ? outfitRaw.name.trim().slice(0, MAX_LOOK_NAME)
    : "Look";

  const outfit: Outfit = {
    id: typeof outfitRaw.id === "string" && outfitRaw.id ? outfitRaw.id : "",
    name,
    slots: slots.value,
    why: typeof outfitRaw.why === "string" ? outfitRaw.why.trim().slice(0, MAX_WHY) : "",
    tip:
      typeof outfitRaw.tip === "string" && outfitRaw.tip.trim()
        ? outfitRaw.tip.trim().slice(0, MAX_TIP)
        : undefined,
  };

  const occasion = typeof raw.occasion === "string" && isOccasionId(raw.occasion) ? raw.occasion : undefined;

  return {
    ok: true,
    value: {
      outfit,
      styleId: optionalId(raw.styleId),
      occasion,
      weather: normalizeWeather(raw.weather),
      generationId: optionalId(raw.generationId),
    },
  };
}

/** Block ids referenced by the outfit that the user does not own. */
export function unknownBlockIds(slots: OutfitSlots, owned: Iterable<string>): string[] {
  const have = new Set(owned);
  return outfitBlockIds(slots).filter((id) => !have.has(id));
}
