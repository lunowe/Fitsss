import { cleanText, clipText, hasVisibleText, textLength } from "./text";
import {
  OUTFIT_SLOTS,
  SLOT_CATEGORY,
  filterClosetForWeather,
  outfitBlockIds,
  validateOutfit,
  type Outfit,
  type WeatherCondition,
  type WeatherSnapshot,
} from "./outfit";
import type { Block, Category } from "./types";

/**
 * Packing for a trip: a place, a run of dates, and what to bring.
 *
 * The model proposes a suitcase and an outfit per day; everything here decides
 * whether that proposal is possible with what the person owns. A piece logged
 * as "×4" can fill at most four slots in the suitcase, and a suitcase only
 * holds so much. Pure: no database, no clock (today is passed in).
 */

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const TRIP_ACTIVITIES = [
  { id: "city", label: "City", hint: "Walking, sights, cafés" },
  { id: "beach", label: "Beach", hint: "Sun, sand, swimming" },
  { id: "outdoors", label: "Outdoors", hint: "Hikes, trails, long walks" },
  { id: "business", label: "Business", hint: "Meetings, office days" },
  { id: "evening", label: "Evenings out", hint: "Dinners, bars, dressing up" },
  { id: "active", label: "Sport", hint: "Gym, runs, a match" },
] as const satisfies readonly { id: string; label: string; hint: string }[];

export type TripActivityId = (typeof TRIP_ACTIVITIES)[number]["id"];

export function isTripActivityId(value: unknown): value is TripActivityId {
  return typeof value === "string" && TRIP_ACTIVITIES.some((a) => a.id === value);
}

/**
 * Room in a bag, in packing units: a T-shirt is 2, a pair of trainers 5. The
 * numbers are rough on purpose; they stop a carry-on from holding four coats,
 * not from holding one T-shirt too many.
 */
export const LUGGAGE_OPTIONS = [
  { id: "carry-on", label: "Carry-on", hint: "Cabin bag only", capacity: 40 },
  { id: "checked", label: "Checked bag", hint: "A full suitcase", capacity: 120 },
] as const satisfies readonly { id: string; label: string; hint: string; capacity: number }[];

export type LuggageId = (typeof LUGGAGE_OPTIONS)[number]["id"];

export function isLuggageId(value: unknown): value is LuggageId {
  return typeof value === "string" && LUGGAGE_OPTIONS.some((l) => l.id === value);
}

export function luggageCapacity(id: LuggageId): number {
  return LUGGAGE_OPTIONS.find((l) => l.id === id)?.capacity ?? 0;
}

/** A weekend (up to three nights) fits a cabin bag; longer gets a suitcase. */
export const CARRY_ON_MAX_NIGHTS = 3;

export function defaultLuggage(days: number): LuggageId {
  return days - 1 <= CARRY_ON_MAX_NIGHTS ? "carry-on" : "checked";
}

/** Up to three weeks: beyond that, nobody packs a day at a time. */
export const MAX_TRIP_DAYS = 21;
/** How far ahead a trip can start. */
export const MAX_TRIP_LEAD_DAYS = 366;
export const MAX_TRIP_NAME_LENGTH = 60;
export const MAX_TRIP_STEER_LENGTH = 200;
export const MAX_TRIP_TIPS = 4;

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** How much room one piece takes, in packing units. */
export function packingSize(block: Pick<Block, "category" | "effectiveWeight" | "typeId">): number {
  const heavy = block.effectiveWeight === "heavy";
  const light = block.effectiveWeight === "light";
  switch (block.category) {
    case "top":
      return heavy ? 3 : 2;
    case "layer":
      return heavy ? 4 : 3;
    case "outerwear":
      return heavy ? 7 : light ? 3 : 5;
    case "bottom":
      return light ? 2 : 3;
    case "fullbody":
      return 3;
    case "footwear":
      return block.typeId === "boots" ? 6 : block.typeId === "sandals" ? 2 : 5;
    case "accessory":
      return 1;
  }
}

/**
 * How many days one piece can be worn before it needs washing. A fresh top
 * every day; trousers and knits go a few days; shoes, coats and accessories
 * are never the limit. With laundry on the way everything washable doubles.
 */
export function wearsPerPiece(category: Category, laundry: boolean): number {
  const factor = laundry ? 2 : 1;
  switch (category) {
    case "top":
    case "fullbody":
      return 1 * factor;
    case "layer":
    case "bottom":
      return 3 * factor;
    case "outerwear":
    case "footwear":
    case "accessory":
      return Number.POSITIVE_INFINITY;
  }
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Every date of the trip, first to last, both included. */
export function tripDates(startDate: string, endDate: string): string[] {
  const count = daysBetween(startDate, endDate) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(startDate, i));
}

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/** Where the trip goes, as picked from a place search. */
export interface TripPlace {
  name: string;
  /** State or region, e.g. "Lisbon District". */
  region?: string;
  country?: string;
  /** ISO 3166-1 alpha-2. */
  countryCode?: string;
  lat: number;
  lon: number;
  /** IANA zone, e.g. "Europe/Lisbon". */
  timezone: string;
}

/** One day's weather: the forecast when it reaches that far, else what is typical then. */
export interface TripDayWeather {
  date: string;
  /** Daytime high, °C. */
  tempC: number;
  lowC?: number;
  feelsLikeC?: number;
  /** 0..100. For a typical day, the share of recent years it rained. */
  precipitationChance?: number;
  condition: WeatherCondition;
  source: "forecast" | "typical";
}

export interface TripOptions {
  activities: TripActivityId[];
  luggage: LuggageId;
  laundry: boolean;
  styleId?: string;
  /** Free text, e.g. "a wedding on Saturday". */
  steer?: string;
}

export interface PackingItem {
  blockId: string;
  /** How many to bring, at most the piece's quantity. */
  count: number;
  /** Ticked off while packing. */
  packed: boolean;
}

export interface TripDayPlan {
  date: string;
  outfit: Outfit;
}

export interface TripPlan {
  days: TripDayPlan[];
  packing: PackingItem[];
  /** Short practical advice, at most four. */
  tips: string[];
  /** What the plan could not satisfy, said plainly (a piece worn more often than owned). */
  warnings: string[];
}

export interface Trip {
  id: string;
  name: string;
  place: TripPlace;
  startDate: string;
  endDate: string;
  options: TripOptions;
  weather: TripDayWeather[];
  /** Null until packed (or when packing failed). */
  plan: TripPlan | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The day's weather as the outfit filter reads it. */
export function dayWeatherSnapshot(day: TripDayWeather, place?: string): WeatherSnapshot {
  return {
    tempC: day.tempC,
    feelsLikeC: day.feelsLikeC,
    lowC: day.lowC,
    precipitationChance: day.precipitationChance,
    condition: day.condition,
    source: "forecast",
    place,
  };
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export interface TripInput {
  name: string;
  place: TripPlace;
  startDate: string;
  endDate: string;
  options: TripOptions;
}

const TIMEZONE = /^[A-Za-z0-9_+\-/]{1,64}$/;

/** A zone the runtime knows: "Europe/Lisbon" yes, "Not/AZone" no. */
export function isKnownTimeZone(zone: string): boolean {
  return canonicalTimeZone(zone) !== undefined;
}

/**
 * The zone as the runtime spells it ("europe/lisbon" is "Europe/Lisbon"),
 * which is how the weather service wants it; undefined when unknown.
 */
export function canonicalTimeZone(zone: string): string | undefined {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Today's date in a time zone, YYYY-MM-DD. */
export function todayIn(zone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function cleanLine(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = cleanText(value).replace(/\s+/g, " ").trim();
  if (!cleaned || !hasVisibleText(cleaned)) return undefined;
  return clipText(cleaned, max);
}

export function validateTripPlace(raw: unknown): { ok: true; value: TripPlace } | { ok: false; errors: string[] } {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const name = cleanLine(input.name, 80);
  if (!name) errors.push("place.name: where the trip goes");
  const lat = input.lat;
  const lon = input.lon;
  if (typeof lat !== "number" || !Number.isFinite(lat) || Math.abs(lat) > 90) errors.push("place.lat: a latitude in degrees");
  if (typeof lon !== "number" || !Number.isFinite(lon) || Math.abs(lon) > 180) errors.push("place.lon: a longitude in degrees");
  const timezone =
    typeof input.timezone === "string" && TIMEZONE.test(input.timezone) ? canonicalTimeZone(input.timezone) : undefined;
  if (!timezone) errors.push("place.timezone: an IANA time zone");
  if (errors.length) return { ok: false, errors };
  const countryCode =
    typeof input.countryCode === "string" && /^[A-Za-z]{2}$/.test(input.countryCode)
      ? input.countryCode.toUpperCase()
      : undefined;
  return {
    ok: true,
    value: {
      name: name!,
      region: cleanLine(input.region, 80),
      country: cleanLine(input.country, 80),
      countryCode,
      lat: lat as number,
      lon: lon as number,
      timezone: timezone!,
    },
  };
}

/**
 * What a client may send to plan a trip. `todayAt` answers today's date in a
 * time zone (the clock is the caller's): dates are checked against the
 * destination's calendar, a day of slack for the traveller who is still a
 * day behind it.
 */
export function validateTripInput(
  raw: unknown,
  todayAt: (zone: string) => string,
): { ok: true; value: TripInput } | { ok: false; errors: string[] } {
  const input = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];

  const place = validateTripPlace(input.place);
  if (!place.ok) errors.push(...place.errors);

  const { startDate, endDate } = input;
  if (!isIsoDate(startDate)) errors.push("startDate: a date written YYYY-MM-DD");
  if (!isIsoDate(endDate)) errors.push("endDate: a date written YYYY-MM-DD");
  let days = 0;
  if (isIsoDate(startDate) && isIsoDate(endDate)) {
    days = daysBetween(startDate, endDate) + 1;
    if (days < 1) errors.push("endDate: the trip ends before it starts");
    else if (days > MAX_TRIP_DAYS) errors.push(`endDate: plan up to ${MAX_TRIP_DAYS} days at a time`);
    if (place.ok) {
      const today = todayAt(place.value.timezone);
      if (daysBetween(today, startDate) < -1) errors.push("startDate: that date has passed");
      else if (daysBetween(today, startDate) > MAX_TRIP_LEAD_DAYS) errors.push("startDate: up to a year ahead");
    }
  }

  const options = validateTripOptions(input, Math.max(days, 1));
  if (!options.ok) errors.push(...options.errors);

  let name: string | undefined;
  if (input.name !== undefined && input.name !== null && input.name !== "") {
    name = cleanLine(input.name, MAX_TRIP_NAME_LENGTH);
    if (!name) errors.push("name: some visible text");
  }

  if (errors.length || !place.ok || !options.ok) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: name ?? clipText(place.value.name, MAX_TRIP_NAME_LENGTH),
      place: place.value,
      startDate: startDate as string,
      endDate: endDate as string,
      options: options.value,
    },
  };
}

/**
 * Activities, luggage, laundry, style and steer. A missing luggage choice gets
 * the default for the trip's length; anything present must be valid.
 */
export function validateTripOptions(
  input: Record<string, unknown>,
  days: number,
): { ok: true; value: TripOptions } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const activities: TripActivityId[] = [];
  if (input.activities !== undefined && input.activities !== null) {
    if (!Array.isArray(input.activities)) errors.push("activities: a list");
    else
      for (const a of input.activities) {
        if (!isTripActivityId(a)) {
          errors.push(typeof a === "string" ? `activities: no activity "${a.slice(0, 30)}"` : "activities: activity ids");
        }
        else if (!activities.includes(a)) activities.push(a);
      }
  }

  let luggage = defaultLuggage(days);
  if (input.luggage !== undefined && input.luggage !== null) {
    if (isLuggageId(input.luggage)) luggage = input.luggage;
    else errors.push("luggage: carry-on or checked");
  }

  let laundry = false;
  if (input.laundry !== undefined && input.laundry !== null) {
    if (typeof input.laundry === "boolean") laundry = input.laundry;
    else errors.push("laundry: true or false");
  }

  let styleId: string | undefined;
  if (input.styleId !== undefined && input.styleId !== null && input.styleId !== "") {
    if (typeof input.styleId === "string" && /^[0-9a-f-]{36}$/i.test(input.styleId)) styleId = input.styleId.toLowerCase();
    else errors.push("styleId: not a style id");
  }

  let steer: string | undefined;
  if (typeof input.steer === "string" && input.steer.trim()) {
    // Measured whole, before anything is cut: 201 characters are refused, not trimmed to fit.
    const cleaned = cleanText(input.steer).replace(/\s+/g, " ").trim();
    // Nothing visible is no note at all, however long.
    if (!hasVisibleText(cleaned)) steer = undefined;
    else if (textLength(cleaned) > MAX_TRIP_STEER_LENGTH) errors.push(`steer: at most ${MAX_TRIP_STEER_LENGTH} characters`);
    else steer = cleaned;
  } else if (input.steer !== undefined && input.steer !== null && typeof input.steer !== "string") {
    errors.push("steer: text");
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { activities, luggage, laundry, styleId, steer } };
}

/* ------------------------------------------------------------------ */
/* The plan                                                            */
/* ------------------------------------------------------------------ */

/** A day's outfit as the model answered, ids already mapped to real ones. */
export interface RawTripDay {
  date: string;
  name?: unknown;
  slots?: unknown;
  why?: unknown;
  tip?: unknown;
}

export interface RawTripPlan {
  days: RawTripDay[];
  packing: { blockId: string; count: unknown }[];
  tips: unknown[];
}

export interface TripPlanContext {
  dates: string[];
  /** The pieces wearable on each date (weather-filtered), by id. */
  wearableByDate: Map<string, Map<string, Block>>;
  /** Dates cold enough that the weather guidance requires outerwear. */
  needsOuterwear?: Set<string>;
  /** Every active piece, by id. */
  closet: Map<string, Block>;
  options: Pick<TripOptions, "laundry" | "luggage">;
}

export interface CheckedTripPlan {
  plan: TripPlan;
  /** Worth a second try: a day missing or unwearable, more than the bag holds. */
  problems: string[];
}

/** How often each piece is worn across the days. */
export function wearCounts(days: TripDayPlan[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const day of days) {
    for (const id of new Set(outfitBlockIds(day.outfit.slots))) uses.set(id, (uses.get(id) ?? 0) + 1);
  }
  return uses;
}

/** How many of a piece the days need, given how often one can be worn. */
export function neededCount(block: Block, uses: number, laundry: boolean): number {
  const per = wearsPerPiece(block.category, laundry);
  return per === Number.POSITIVE_INFINITY ? 1 : Math.ceil(uses / per);
}

/**
 * Room the bag needs: everything brought, less the travel outfit (worn on the
 * way, so the bulky boots and the coat take no space).
 */
export function packedVolume(packing: PackingItem[], closet: Map<string, Block>, travel?: Outfit): number {
  let volume = 0;
  for (const item of packing) {
    const block = closet.get(item.blockId);
    if (block) volume += packingSize(block) * item.count;
  }
  if (travel) {
    for (const id of new Set(outfitBlockIds(travel.slots))) {
      const block = closet.get(id);
      if (block && packing.some((p) => p.blockId === id)) volume -= packingSize(block);
    }
  }
  return volume;
}

const CATEGORY_ORDER: readonly Category[] = ["outerwear", "layer", "top", "fullbody", "bottom", "footwear", "accessory"];

/**
 * Checks a proposed plan against the trip and the closet and returns the plan
 * that will be stored. The suitcase always covers the outfits and never holds
 * more of a piece than the person owns; where the days ask for more than that,
 * the plan keeps them and says so in `warnings`.
 */
export function checkTripPlan(raw: RawTripPlan, ctx: TripPlanContext): CheckedTripPlan {
  const problems: string[] = [];
  const coldDays: string[] = [];

  const days: TripDayPlan[] = [];
  for (const date of ctx.dates) {
    const answer = raw.days.find((d) => d.date === date);
    if (!answer) {
      problems.push(`${date}: no outfit`);
      continue;
    }
    const wearable = ctx.wearableByDate.get(date) ?? new Map<string, Block>();
    const checked = validateOutfit(answer, wearable);
    if (!checked.ok) {
      problems.push(`${date}: ${checked.errors.slice(0, 3).join(", ")}`);
      continue;
    }
    days.push({ date, outfit: checked.outfit });
    // Cold enough for a coat by the weather guidance, and none worn.
    if (ctx.needsOuterwear?.has(date) && !checked.outfit.slots.outerwear) {
      const coats = [...wearable.values()].some((b) => b.category === "outerwear");
      if (coats) problems.push(`${date}: outerwear is required that day`);
      coldDays.push(date);
    }
  }

  // What the model packed, clamped to what exists and is owned.
  const counts = new Map<string, number>();
  for (const item of raw.packing) {
    const block = ctx.closet.get(item.blockId);
    if (!block) continue;
    const count = typeof item.count === "number" && Number.isFinite(item.count) ? Math.floor(item.count) : 1;
    if (count < 1) continue;
    counts.set(block.id, Math.min(block.quantity, Math.max(counts.get(block.id) ?? 0, count)));
  }
  const { packing, warnings, overCapacity } = settlePacking(
    days,
    [...counts].map(([blockId, count]) => ({ blockId, count, packed: false })),
    ctx.closet,
    ctx.options,
  );
  if (overCapacity) problems.push(overCapacity);

  const tips = raw.tips
    .map((tip) => cleanLine(tip, 200))
    .filter((tip): tip is string => Boolean(tip))
    .slice(0, MAX_TRIP_TIPS);

  const cold = coldWarning(coldDays);
  return { plan: { days, packing, tips, warnings: cold ? [cold, ...warnings] : warnings }, problems };
}

/** The dates whose weather guidance requires outerwear, given what the closet holds. */
export function datesNeedingOuterwear(weather: TripDayWeather[], closet: Block[]): Set<string> {
  const out = new Set<string>();
  for (const day of weather) {
    if (filterClosetForWeather(closet, dayWeatherSnapshot(day)).outerwear === "required") out.add(day.date);
  }
  return out;
}

/** Days cold enough for a coat whose outfit has none. */
export function coldDaysWithoutCoat(days: TripDayPlan[], needsOuterwear: Set<string>): string[] {
  return days.filter((d) => needsOuterwear.has(d.date) && !d.outfit.slots.outerwear).map((d) => d.date);
}

export function coldWarning(dates: string[]): string | undefined {
  if (!dates.length) return undefined;
  return `${listDates(dates)} ${dates.length === 1 ? "is" : "are"} cold enough for a coat, and the plan has none for ${dates.length === 1 ? "it" : "them"}.`;
}

/**
 * The suitcase for a set of days: every piece worn is packed, as many as the
 * days need and the person owns, nothing that is no longer in the closet.
 * Counts and ticks already there are kept (a spare stays a spare). Returns
 * what could not be met, in words, and whether the bag overflows.
 */
export function settlePacking(
  days: TripDayPlan[],
  packing: PackingItem[],
  closet: Map<string, Block>,
  options: Pick<TripOptions, "laundry" | "luggage">,
  /** Archived pieces, to name a worn piece that has left the closet. */
  archived: Map<string, Block> = new Map(),
): { packing: PackingItem[]; warnings: string[]; overCapacity?: string } {
  const warnings: string[] = [];

  // A day still wearing a piece that is no longer in the closet (archived
  // after packing): it cannot be packed, so say where to swap it.
  const goneOn = new Map<string, { dates: string[]; slot: string }>();
  for (const day of days) {
    const slots = day.outfit.slots;
    const worn: [string, string][] = [
      ...OUTFIT_SLOTS.flatMap((slot): [string, string][] => (slots[slot] ? [[slots[slot]!, slot]] : [])),
      ...slots.accessories.map((id): [string, string] => [id, "accessories"]),
    ];
    for (const [id, slot] of worn) {
      if (closet.has(id)) continue;
      const entry = goneOn.get(id) ?? { dates: [], slot };
      if (!entry.dates.includes(day.date)) entry.dates.push(day.date);
      goneOn.set(id, entry);
    }
  }
  for (const [id, { dates, slot }] of goneOn) {
    const block = archived.get(id);
    warnings.push(
      block
        ? `${capitalise(block.nickname || block.label)} is no longer in your closet: swap it on ${listDates(dates)}.`
        : `The ${SLOT_NOUN[slot] ?? "piece"} worn on ${listDates(dates)} has been deleted from your closet: swap it there.`,
    );
  }

  // A piece re-filed since (a top edited into a different kind of piece) no
  // longer fits the slot the day wears it in.
  const misfiledOn = new Map<string, string[]>();
  for (const day of days) {
    const slots = day.outfit.slots;
    for (const slot of OUTFIT_SLOTS) {
      const id = slots[slot];
      const block = id ? closet.get(id) : undefined;
      if (block && block.category !== SLOT_CATEGORY[slot]) misfiledOn.set(block.id, [...(misfiledOn.get(block.id) ?? []), day.date]);
    }
    for (const id of slots.accessories) {
      const block = closet.get(id);
      if (block && block.category !== "accessory") misfiledOn.set(block.id, [...(misfiledOn.get(block.id) ?? []), day.date]);
    }
  }
  for (const [id, dates] of misfiledOn) {
    const block = closet.get(id)!;
    warnings.push(`${capitalise(block.nickname || block.label)} has changed since packing: swap it on ${listDates(dates)}.`);
  }
  const items = new Map<string, PackingItem>();
  for (const item of packing) {
    const block = closet.get(item.blockId);
    if (!block || item.count < 1) continue;
    items.set(item.blockId, { blockId: item.blockId, count: Math.min(block.quantity, item.count), packed: item.packed });
  }

  for (const [id, uses] of wearCounts(days)) {
    const block = closet.get(id);
    if (!block) continue;
    const needed = neededCount(block, uses, options.laundry);
    if (needed > block.quantity) {
      const owned = block.quantity === 1 ? "one" : `${block.quantity}`;
      warnings.push(
        `${capitalise(block.nickname || block.label)} is worn ${uses} ${uses === 1 ? "day" : "days"}; you have ${owned}${options.laundry ? "" : " and no laundry"}.`,
      );
    }
    const current = items.get(id);
    const count = Math.min(block.quantity, Math.max(current?.count ?? 0, needed));
    items.set(id, { blockId: id, count, packed: current?.packed ?? false });
  }

  const sorted = [...items.values()].sort((a, b) => {
    const ba = closet.get(a.blockId)!;
    const bb = closet.get(b.blockId)!;
    const byCategory = CATEGORY_ORDER.indexOf(ba.category) - CATEGORY_ORDER.indexOf(bb.category);
    return byCategory !== 0 ? byCategory : ba.label.localeCompare(bb.label);
  });

  const capacity = luggageCapacity(options.luggage);
  const volume = packedVolume(sorted, closet, days[0]?.outfit);
  let overCapacity: string | undefined;
  if (volume > capacity) {
    const bag = options.luggage === "carry-on" ? "a carry-on" : "one checked bag";
    overCapacity = `the suitcase needs ${volume} units of room; ${bag} holds ${capacity}`;
    warnings.push(`This is more than fits in ${bag}.`);
  }
  // Two pieces gone from the same day must not read as one sentence twice.
  return { packing: sorted, warnings: [...new Set(warnings)], overCapacity };
}

/** What a slot is called in a sentence about a piece that is gone. */
const SLOT_NOUN: Record<string, string> = {
  top: "top",
  layer: "layer",
  outerwear: "outerwear",
  bottom: "bottom",
  fullbody: "dress or jumpsuit",
  footwear: "pair of shoes",
  accessories: "accessory",
};

/** The pieces the days wear at least this many of: what a count may not drop below. */
export function minimumCounts(days: TripDayPlan[], closet: Map<string, Block>, laundry: boolean): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, uses] of wearCounts(days)) {
    const block = closet.get(id);
    if (block) out.set(id, Math.min(block.quantity, neededCount(block, uses, laundry)));
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 3", "Nov 3 and Nov 5", "Nov 3, Nov 4 and Nov 5". */
export function listDates(dates: string[]): string {
  const names = dates.map((date) => {
    const [, m, d] = date.split("-").map(Number);
    return `${MONTHS[m - 1] ?? ""} ${d}`;
  });
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
