import "server-only";

import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, styles, trips } from "@/db/schema";
import {
  SLOT_CATEGORY,
  checkTripPlan,
  coldDaysWithoutCoat,
  coldWarning,
  datesNeedingOuterwear,
  dayWeatherSnapshot,
  filterClosetForWeather,
  listDates,
  isIsoDate,
  minimumCounts,
  outfitBlockIds,
  settlePacking,
  todayIn,
  tripDates,
  validateTripInput,
  validateTripOptions,
  type Block,
  type OutfitSlot,
  type Trip,
  type TripDayWeather,
  type TripOptions,
  type TripPlace,
  type TripPlan,
} from "@/domain";
import { cleanText, clipText, hasVisibleText, MAX_TRIP_NAME_LENGTH } from "@/domain";
import { isUuid } from "@/lib/llm/generation-request";
import type { WeatherGuidance } from "@/lib/llm/outfit-prompt";
import { callStructured, providerConfigured } from "@/lib/llm/provider";
import { TRIP_SYSTEM_PROMPT, buildTripPrompt, resolveTripOutput, tripOutputSchema } from "@/lib/llm/trip-prompt";
import { mockTripPlan } from "@/lib/trip/mock-plan";
import { rowToBlock } from "@/server/blocks-queries";
import { loadActiveBlocks, loadStyle } from "@/server/generate-core";
import { getLlmSettingsForUser } from "@/server/settings-queries";
import { tasteNotesForPrompt } from "@/server/taste-core";
import { tripWeather } from "@/server/trip-weather";

/**
 * Trips: create one (place, dates, options, the weather), pack it (one model
 * call: the suitcase and an outfit a day, checked against what the person
 * owns), and the edits afterwards (ticks, counts, swapping a day's piece).
 * Shared by the server actions and `/api/v1/trips`.
 */

export type TripErrorCode =
  | "invalid"
  | "not-found"
  | "limit"
  | "busy"
  | "rate-limited"
  | "weather"
  | "not-configured"
  | "empty-closet"
  | "too-few-pieces"
  | "llm";

export type TripResult = { ok: true; trip: Trip } | { ok: false; code: TripErrorCode; error: string; errors?: string[] };

/** Trips kept per person. Old ones can be deleted. */
export const MAX_TRIPS = 200;

type TripRow = typeof trips.$inferSelect;

function toTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    place: row.place as TripPlace,
    startDate: row.startDate,
    endDate: row.endDate,
    options: row.options as TripOptions,
    weather: (row.weather as TripDayWeather[]) ?? [],
    plan: (row.plan as TripPlan | null) ?? null,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The person's pieces, active and archived, read inside `tx` when given. */
async function loadCloset(
  userId: string,
  tx: Pick<typeof db, "select"> = db,
): Promise<{ active: Map<string, Block>; archived: Map<string, Block> }> {
  const rows = await tx.select().from(blocks).where(eq(blocks.userId, userId));
  const active = new Map<string, Block>();
  const archived = new Map<string, Block>();
  for (const row of rows) {
    const block = rowToBlock(row);
    (block.archivedAt ? archived : active).set(block.id, block);
  }
  return { active, archived };
}

async function ownStyleId(userId: string, styleId: string | undefined): Promise<string | undefined> {
  if (!styleId || !isUuid(styleId)) return undefined;
  const [row] = await db
    .select({ id: styles.id })
    .from(styles)
    .where(and(eq(styles.id, styleId), eq(styles.userId, userId), isNull(styles.archivedAt)))
    .limit(1);
  return row?.id;
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

/**
 * A stored plan read against the closet as it is now: a quantity lowered, a
 * piece archived or deleted since the last write shows in the counts and the
 * warnings straight away, not after the next edit. Nothing is written.
 */
function asReadNow(trip: Trip, closet: { active: Map<string, Block>; archived: Map<string, Block> }): Trip {
  if (!trip.plan) return trip;
  const settled = settlePacking(trip.plan.days, trip.plan.packing, closet.active, trip.options, closet.archived);
  return {
    ...trip,
    plan: { ...trip.plan, packing: settled.packing, warnings: planWarnings(trip, trip.plan.days, closet.active, settled.warnings) },
  };
}

/** Newest start first. */
export async function listTripsForUser(userId: string): Promise<Trip[]> {
  const [rows, closet] = await Promise.all([
    db.select().from(trips).where(eq(trips.userId, userId)).orderBy(desc(trips.startDate), asc(trips.createdAt)),
    loadCloset(userId),
  ]);
  return rows.map((row) => asReadNow(toTrip(row), closet));
}

export async function getTripForUser(userId: string, id: string): Promise<Trip | null> {
  if (!isUuid(id)) return null;
  const [[row], closet] = await Promise.all([
    db
      .select()
      .from(trips)
      .where(and(eq(trips.id, id.toLowerCase()), eq(trips.userId, userId)))
      .limit(1),
    loadCloset(userId),
  ]);
  return row ? asReadNow(toTrip(row), closet) : null;
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

/** Stores the trip with its weather, unpacked. Packing is `planTripForUser`. */
export async function createTripForUser(userId: string, input: unknown): Promise<TripResult> {
  const checked = validateTripInput(input, (zone) => todayIn(zone));
  if (!checked.ok) return { ok: false, code: "invalid", error: "The trip did not validate.", errors: checked.errors };
  const { value } = checked;

  const options: TripOptions = { ...value.options, styleId: await ownStyleId(userId, value.options.styleId) };

  const weather = await tripWeather(value.place, tripDates(value.startDate, value.endDate));
  if (!weather.ok) return { ok: false, code: "weather", error: weather.error };

  // Counted and inserted under one lock per person, so parallel creates
  // cannot pass the cap together.
  return db.transaction(async (tx): Promise<TripResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trips:${userId}`}))`);
    const [{ total }] = await tx.select({ total: count() }).from(trips).where(eq(trips.userId, userId));
    if (total >= MAX_TRIPS) {
      return { ok: false, code: "limit", error: `You have ${MAX_TRIPS} trips. Delete an old one first.` };
    }
    const [row] = await tx
      .insert(trips)
      .values({
        userId,
        name: value.name,
        place: value.place,
        startDate: value.startDate,
        endDate: value.endDate,
        options,
        weather: weather.days,
      })
      .returning();
    return { ok: true, trip: toTrip(row) };
  });
}

/* ------------------------------------------------------------------ */
/* Pack                                                                */
/* ------------------------------------------------------------------ */

/**
 * Output budget: thinking counts against it, so it is generous. Capped below
 * what the SDK allows without streaming.
 */
const MAX_OUTPUT_TOKENS_BASE = 6000;
const MAX_OUTPUT_TOKENS_PER_DAY = 700;
const MAX_OUTPUT_TOKENS = 20_000;

/**
 * Packing runs in this process, per trip: asking again with the same note
 * joins the running one; another note is refused until it is done. Edits
 * other than ticks wait too (see `isPacking`). One server instance, so this
 * is the whole picture.
 */
const packing = new Map<string, { steer: Promise<string | undefined>; run: Promise<TripResult> }>();

/**
 * Edits admitted before a packing started, per trip. Packing waits for them
 * before it reads the trip, so its final write cannot undo one; edits that
 * arrive once packing has started are refused (`isPacking`).
 */
const editsInFlight = new Map<string, Set<Promise<unknown>>>();

function admitEdit<T>(key: string, edit: () => Promise<T>): Promise<T> {
  const running = edit();
  const set = editsInFlight.get(key) ?? new Set<Promise<unknown>>();
  set.add(running);
  editsInFlight.set(key, set);
  void running
    .catch(() => {})
    .finally(() => {
      set.delete(running);
      if (set.size === 0 && editsInFlight.get(key) === set) editsInFlight.delete(key);
    });
  return running;
}

/** Each packing is one or two big model calls on the server's key. */
export const MAX_PACKINGS_AT_ONCE = 2;
export const MAX_PACKINGS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;
const recentPackings = new Map<string, number[]>();

function tripKey(userId: string, id: string): string {
  return `${userId}:${id.toLowerCase()}`;
}

/** Whether a trip is being packed right now. */
export function isPacking(userId: string, id: string): boolean {
  return packing.has(tripKey(userId, id));
}

function runningForUser(userId: string): number {
  let n = 0;
  for (const key of packing.keys()) if (key.startsWith(`${userId}:`)) n++;
  return n;
}

/** Counts a real (paid) packing against the hourly allowance; false when spent. */
function takePackingSlot(userId: string): boolean {
  const now = Date.now();
  const recent = (recentPackings.get(userId) ?? []).filter((at) => now - at < HOUR_MS);
  if (recent.length >= MAX_PACKINGS_PER_HOUR) {
    recentPackings.set(userId, recent);
    return false;
  }
  recent.push(now);
  recentPackings.set(userId, recent);
  return true;
}

/**
 * Packs the trip: refreshes the weather (a day may have come into forecast
 * range), plans with the model (or the mock), checks the plan, and stores it.
 * `input.steer` replaces the trip's note when given. Ticks on pieces that are
 * still packed carry over. Slow: a model call, sometimes two.
 */
export async function planTripForUser(userId: string, id: string, input: unknown = {}): Promise<TripResult> {
  const raw = (typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  let steer: string | undefined;
  const steers = raw.steer !== undefined;
  if (steers) {
    const checked = validateTripOptions({ steer: raw.steer }, 1);
    if (!checked.ok) return { ok: false, code: "invalid", error: "The note did not validate.", errors: checked.errors };
    steer = checked.value.steer;
  }

  const key = tripKey(userId, id);
  const running = packing.get(key);
  if (running) {
    // Joined when it would pack with the same note: none given means "the
    // trip's note", which is what the running one uses unless it was given one.
    if (!steers || (await running.steer) === steer) return running.run;
    return { ok: false, code: "busy", error: "This trip is being packed with another note. Try again when it is done." };
  }
  if (runningForUser(userId) >= MAX_PACKINGS_AT_ONCE) {
    return { ok: false, code: "busy", error: "Two trips are being packed already. Try again when one is done." };
  }
  let settleSteer!: (steer: string | undefined) => void;
  const effectiveSteer = new Promise<string | undefined>((resolve) => (settleSteer = resolve));
  const pending = [...(editsInFlight.get(key) ?? [])];
  const run = runPlan(userId, id, steers, steer, pending, settleSteer).finally(() => {
    settleSteer(undefined);
    packing.delete(key);
  });
  packing.set(key, { steer: effectiveSteer, run });
  return run;
}

async function runPlan(
  userId: string,
  id: string,
  steers: boolean,
  steer: string | undefined,
  pendingEdits: Promise<unknown>[],
  settleSteer: (steer: string | undefined) => void,
): Promise<TripResult> {
  // Edits admitted before packing began land first, so the plan starts from them.
  await Promise.allSettled(pendingEdits);
  const trip = await getTripForUser(userId, id);
  if (!trip) return { ok: false, code: "not-found", error: "That trip is gone." };
  settleSteer(steers ? steer : trip.options.steer);

  let options = steers ? { ...trip.options, steer } : trip.options;
  options = { ...options, styleId: await ownStyleId(userId, options.styleId) };

  const llm = await getLlmSettingsForUser(userId);
  const mock = llm.provider === "mock";
  if (!mock) {
    const configured = providerConfigured(llm);
    if (!configured.ok) return { ok: false, code: "not-configured", error: configured.error };
    if (!takePackingSlot(userId)) {
      return {
        ok: false,
        code: "rate-limited",
        error: `That is ${MAX_PACKINGS_PER_HOUR} packings this hour. Try again later.`,
      };
    }
  }

  const dates = tripDates(trip.startDate, trip.endDate);
  const fresh = await tripWeather(trip.place, dates);
  const weather = fresh.ok ? fresh.days : trip.weather;
  if (weather.length !== dates.length) {
    return { ok: false, code: "weather", error: "Could not get the weather for those dates. Try again in a moment." };
  }

  const active = await loadActiveBlocks(userId);
  if (active.length === 0) {
    return { ok: false, code: "empty-closet", error: "Your closet is empty. Add a few pieces first." };
  }
  const closet = new Map(active.map((b) => [b.id, b]));

  const wearableByDate = new Map<string, Map<string, Block>>();
  const guidanceByDate = new Map<string, WeatherGuidance>();
  const needsOuterwear = new Set<string>();
  const candidates = new Map<string, Block>();
  for (const day of weather) {
    const filtered = filterClosetForWeather(active, dayWeatherSnapshot(day, trip.place.name));
    const wearable = new Map(filtered.wearable.map((b) => [b.id, b]));
    const has = (category: Block["category"]) => filtered.wearable.some((b) => b.category === category);
    if (!has("footwear") || !((has("top") && has("bottom")) || has("fullbody"))) {
      return {
        ok: false,
        code: "too-few-pieces",
        error: `Nothing in the closet suits ${listDates([day.date])} (${Math.round(day.tempC)}°): it needs shoes and a top with a bottom, or a dress or jumpsuit. Add pieces for that weather.`,
      };
    }
    wearableByDate.set(day.date, wearable);
    guidanceByDate.set(day.date, { outerwear: filtered.outerwear, layer: filtered.layer, notes: filtered.notes });
    if (filtered.outerwear === "required") needsOuterwear.add(day.date);
    for (const block of filtered.wearable) candidates.set(block.id, block);
  }

  const ctx = { dates, wearableByDate, needsOuterwear, closet, options };
  let model = mock ? "mock" : llm.models.outfits;
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, attempts: 0 };
  let best: { plan: TripPlan; problems: string[] } | null = null;

  if (mock) {
    best = checkTripPlan(mockTripPlan({ dates, wearableByDate, guidanceByDate, laundry: options.laundry }), ctx);
  } else {
    const style = await loadStyle(userId, options.styleId);
    const tasteNotes = await tasteNotesForPrompt(userId, options.styleId ?? null);
    const candidateList = [...candidates.values()];
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = buildTripPrompt({
        candidates: candidateList,
        place: trip.place,
        days: weather.map((day) => ({
          weather: day,
          guidance: guidanceByDate.get(day.date)!,
          unsuitable: candidateList.filter((b) => !wearableByDate.get(day.date)!.has(b.id)),
        })),
        options,
        style,
        tasteNotes,
        correction:
          attempt === 0 || !best
            ? undefined
            : `Your previous answer could not be used as it was: ${best.problems.slice(0, 6).join("; ")}. Fix exactly these, keep the rest, and return an outfit for every date.`,
      });
      usage.attempts += 1;
      const answer = await callStructured(
        {
          task: "outfits",
          system: TRIP_SYSTEM_PROMPT,
          user: prompt.user,
          schema: tripOutputSchema,
          schemaName: "trip",
          maxTokens: Math.min(MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS_BASE + MAX_OUTPUT_TOKENS_PER_DAY * dates.length),
        },
        llm,
      );
      if (!answer.ok) {
        if (answer.code === "invalid-output" && attempt === 0) continue;
        if (best) break;
        return { ok: false, code: answer.code === "not-configured" ? "not-configured" : "llm", error: answer.error };
      }
      model = answer.model;
      usage.inputTokens += answer.usage.inputTokens;
      usage.outputTokens += answer.usage.outputTokens;
      usage.cacheReadInputTokens += answer.usage.cacheReadInputTokens ?? 0;

      const checked = checkTripPlan(resolveTripOutput(answer.value, prompt.index), ctx);
      if (!best || score(checked) > score(best)) best = checked;
      if (checked.problems.length === 0) break;
      console.warn(`[trips] plan attempt ${attempt + 1}: ${checked.problems.join(" | ")}`);
    }
  }

  // A day without an outfit is not a plan; anything else (a piece worn more
  // often than owned, a full bag) is kept and shown as a warning.
  if (!best || best.plan.days.length < dates.length) {
    return {
      ok: false,
      code: "llm",
      error: "The stylist could not plan every day from these pieces. Try again, or change the dates or the note.",
    };
  }

  // Written under the row lock, against the row as it is now: an edit made
  // while the model was working (a new bag, a tick) is kept, not undone by
  // what was read before. Ticks survive for pieces still in the bag.
  const planned = best.plan;
  return db.transaction(async (tx): Promise<TripResult> => {
    const [current] = await tx
      .select()
      .from(trips)
      .where(and(eq(trips.id, trip.id), eq(trips.userId, userId)))
      .for("update")
      .limit(1);
    if (!current) return { ok: false, code: "not-found", error: "That trip was deleted meanwhile." };
    const now = toTrip(current);
    const ticked = new Set((now.plan?.packing ?? []).filter((p) => p.packed).map((p) => p.blockId));
    const storedOptions: TripOptions = steers ? { ...now.options, steer } : now.options;
    // The closet as it is now: a quantity lowered or a piece archived while
    // the model worked must not be packed as it was.
    const fresh = await loadCloset(userId, tx);
    const settled = settlePacking(
      planned.days,
      planned.packing.map((item) => ({ ...item, packed: ticked.has(item.blockId) })),
      fresh.active,
      storedOptions,
      fresh.archived,
    );
    const plan: TripPlan = {
      ...planned,
      packing: settled.packing,
      warnings: planWarnings({ ...now, weather }, planned.days, fresh.active, settled.warnings),
    };
    const [row] = await tx
      .update(trips)
      .set({ plan, weather, options: storedOptions, model, usage, updatedAt: new Date() })
      .where(eq(trips.id, current.id))
      .returning();
    return { ok: true, trip: toTrip(row) };
  });
}

/** The warnings for a plan's days now: a cold day without a coat first, then the suitcase's. */
function planWarnings(trip: Trip, days: TripPlan["days"], closet: Map<string, Block>, settled: string[]): string[] {
  const cold = coldWarning(coldDaysWithoutCoat(days, datesNeedingOuterwear(trip.weather, [...closet.values()])));
  return cold ? [cold, ...settled] : settled;
}

/** Days planned first, then fewer problems. */
function score(checked: { plan: TripPlan; problems: string[] }): number {
  return checked.plan.days.length * 100 - checked.problems.length;
}

/* ------------------------------------------------------------------ */
/* Edit                                                                */
/* ------------------------------------------------------------------ */

/**
 * Locks the trip row, hands it to `change`, and writes back what it returns.
 * `change` answers an error string to refuse, or the fields to store.
 */
async function changeTrip(
  userId: string,
  id: string,
  change: (
    trip: Trip,
    closet: Map<string, Block>,
    archived: Map<string, Block>,
  ) => Promise<string | Partial<Pick<Trip, "name" | "options" | "plan">>>,
): Promise<TripResult> {
  if (!isUuid(id)) return { ok: false, code: "not-found", error: "That trip is gone." };
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(trips)
      .where(and(eq(trips.id, id.toLowerCase()), eq(trips.userId, userId)))
      .for("update")
      .limit(1);
    if (!row) return { ok: false, code: "not-found", error: "That trip is gone." } as const;
    const { active, archived } = await loadCloset(userId, tx);
    const outcome = await change(toTrip(row), active, archived);
    if (typeof outcome === "string") return { ok: false, code: "invalid", error: outcome, errors: [outcome] } as const;
    const [updated] = await tx
      .update(trips)
      .set({ ...outcome, updatedAt: new Date() })
      .where(eq(trips.id, row.id))
      .returning();
    return { ok: true, trip: toTrip(updated) } as const;
  });
}

/**
 * PATCH: `name`, the options (`activities`, `luggage`, `laundry`, `styleId`,
 * `steer`; stored for the next packing, the plan stays), `packed: { [blockId]:
 * bool }` ticks, and `counts: { [blockId]: n }` (0 takes a piece out; never
 * below what the days wear, never above what is owned; a new piece can be
 * added as a spare).
 */
export async function updateTripForUser(userId: string, id: string, input: unknown): Promise<TripResult> {
  const raw = (typeof input === "object" && input !== null && !Array.isArray(input) ? input : null) as Record<string, unknown> | null;
  if (!raw) return { ok: false, code: "invalid", error: "Send the changes as an object.", errors: ["Send the changes as an object."] };

  const fields = ["name", "activities", "luggage", "laundry", "styleId", "steer", "packed", "counts"];
  const unknown = Object.keys(raw).filter((key) => !fields.includes(key));
  if (unknown.length) {
    const error = `There is no field "${unknown[0].slice(0, 30)}" to change.`;
    return { ok: false, code: "invalid", error, errors: [error] };
  }
  const isEmptyMap = (value: unknown) => typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
  if (Object.keys(raw).every((key) => (key === "packed" || key === "counts") && isEmptyMap(raw[key]))) {
    return { ok: false, code: "invalid", error: "Nothing to change.", errors: ["Nothing to change."] };
  }

  // A repack replaces the plan and reads the options it started with: while
  // it runs, only ticks (which carry over) are taken.
  if (isPacking(userId, id) && Object.keys(raw).some((key) => key !== "packed")) {
    return { ok: false, code: "busy", error: "The trip is being packed. Try again when it is done." };
  }

  return admitEdit(tripKey(userId, id), () => changeTrip(userId, id, async (trip, closet, archived) => {
    const patch: Partial<Pick<Trip, "name" | "options" | "plan">> = {};

    if (raw.name !== undefined) {
      const name = typeof raw.name === "string" ? clipText(cleanText(raw.name).replace(/\s+/g, " ").trim(), MAX_TRIP_NAME_LENGTH) : "";
      if (!name || !hasVisibleText(name)) return "name: some visible text";
      patch.name = name;
    }

    const optionKeys = ["activities", "luggage", "laundry", "styleId", "steer"] as const;
    if (optionKeys.some((key) => raw[key] !== undefined)) {
      const merged: Record<string, unknown> = { ...trip.options };
      for (const key of optionKeys) if (raw[key] !== undefined) merged[key] = raw[key];
      const days = tripDates(trip.startDate, trip.endDate).length;
      const checked = validateTripOptions(merged, days);
      if (!checked.ok) return checked.errors[0];
      patch.options = { ...checked.value, styleId: await ownStyleId(userId, checked.value.styleId) };
    }

    if (raw.packed !== undefined || raw.counts !== undefined) {
      if (!trip.plan) return "The trip is not packed yet.";
      const plan = trip.plan;
      const items = new Map(plan.packing.map((item) => [item.blockId, { ...item }]));

      if (raw.counts !== undefined) {
        if (typeof raw.counts !== "object" || raw.counts === null || Array.isArray(raw.counts)) return "counts: piece ids to numbers";
        const floor = minimumCounts(plan.days, closet, (patch.options ?? trip.options).laundry);
        for (const [rawId, value] of Object.entries(raw.counts)) {
          const blockId = rawId.toLowerCase();
          const block = closet.get(blockId);
          if (!block) return "That piece is not in your closet.";
          if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return "counts: whole numbers from 0";
          if (value > block.quantity) return `You have ${block.quantity} of that piece.`;
          const needed = floor.get(blockId) ?? 0;
          if (value < needed) {
            return value === 0
              ? "A day's outfit wears that piece. Swap it there first."
              : `The days need ${needed} of that piece: keep at least ${needed}.`;
          }
          if (value === 0) items.delete(blockId);
          else items.set(blockId, { blockId, count: value, packed: items.get(blockId)?.packed ?? false });
        }
      }

      if (raw.packed !== undefined) {
        if (typeof raw.packed !== "object" || raw.packed === null || Array.isArray(raw.packed)) return "packed: piece ids to true or false";
        for (const [rawId, value] of Object.entries(raw.packed)) {
          const blockId = rawId.toLowerCase();
          if (typeof value !== "boolean") return "packed: true or false";
          const item = items.get(blockId);
          // A tick on a piece no longer in the bag (taken out meanwhile) changes nothing.
          if (item) item.packed = value;
        }
      }

      const settled = settlePacking(plan.days, [...items.values()], closet, patch.options ?? trip.options, archived);
      patch.plan = { ...plan, packing: settled.packing, warnings: planWarnings(trip, plan.days, closet, settled.warnings) };
    } else if (trip.plan) {
      // Every edit reads the suitcase against the closet as it is now: a new
      // bag or laundry changes what fits, a piece archived or re-filed since
      // gets its warning.
      const settled = settlePacking(trip.plan.days, trip.plan.packing, closet, patch.options ?? trip.options, archived);
      patch.plan = { ...trip.plan, packing: settled.packing, warnings: planWarnings(trip, trip.plan.days, closet, settled.warnings) };
    }

    if (Object.keys(patch).length === 0) return "Nothing to change.";
    return patch;
  }));
}

/**
 * Changes one day's outfit, and the suitcase follows (the new piece is
 * packed, counts are settled). `{ date, slot, toBlockId, fromBlockId? }`:
 * - a piece of the person's into the slot (accessories: `fromBlockId`
 *   replaced, or added when absent);
 * - `toBlockId: null` takes a layer, outerwear or accessory (`fromBlockId`) off;
 * - `slot: "separates"` with `top` and `bottom` replaces a full-body piece.
 * A piece the day already wears in another slot is refused.
 */
export async function swapTripPieceForUser(userId: string, id: string, input: unknown): Promise<TripResult> {
  const given = (typeof input === "object" && input !== null && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  // Piece ids in any case: they are stored lower-case.
  const lower = (value: unknown) => (typeof value === "string" ? value.toLowerCase() : value);
  const raw: Record<string, unknown> = {
    ...given,
    toBlockId: lower(given.toBlockId),
    fromBlockId: lower(given.fromBlockId),
    top: lower(given.top),
    bottom: lower(given.bottom),
  };
  const { date, slot, toBlockId, fromBlockId } = raw;
  const refuse = (error: string): TripResult => ({ ok: false, code: "invalid", error, errors: [error] });
  if (!isIsoDate(date)) return refuse("date: a day of the trip");
  const slots = ["top", "layer", "outerwear", "bottom", "fullbody", "footwear", "accessories", "separates"] as const;
  if (typeof slot !== "string" || !(slots as readonly string[]).includes(slot)) return refuse("slot: one of " + slots.join(", "));
  const removing = toBlockId === null;
  if (slot === "separates") {
    if (typeof raw.top !== "string" || typeof raw.bottom !== "string") return refuse("separates: a top and a bottom");
  } else if (removing) {
    if (slot !== "layer" && slot !== "outerwear" && slot !== "accessories") return refuse("Only a layer, outerwear or an accessory can be taken off.");
    if (slot === "accessories" && typeof fromBlockId !== "string") return refuse("fromBlockId: the accessory to take off");
  } else if (typeof toBlockId !== "string") {
    return refuse("toBlockId: a piece, or null to take one off");
  }
  if (isPacking(userId, id)) return { ok: false, code: "busy", error: "The trip is being packed. Try again when it is done." };

  return admitEdit(tripKey(userId, id), () => changeTrip(userId, id, async (trip, closet, archived) => {
    if (!trip.plan) return "The trip is not packed yet.";
    const dayIndex = trip.plan.days.findIndex((d) => d.date === date);
    if (dayIndex < 0) return "That day is not part of the trip.";
    const day = trip.plan.days[dayIndex];
    const outfitSlots = { ...day.outfit.slots, accessories: [...day.outfit.slots.accessories] };

    /** The piece, owned, of the right kind, and not already worn elsewhere that day. */
    const piece = (blockId: string, category: Block["category"], replacing?: string): Block | string => {
      const block = closet.get(blockId);
      if (!block) return "That piece is not in your closet.";
      if (block.category !== category) return `That piece is not a ${category}.`;
      const worn = outfitBlockIds(outfitSlots).filter((wornId) => wornId !== replacing);
      if (worn.includes(block.id)) return "That day already wears it.";
      return block;
    };

    if (slot === "separates") {
      if (!outfitSlots.fullbody) return "That day already wears a top and a bottom.";
      const top = piece(raw.top as string, "top", outfitSlots.fullbody);
      if (typeof top === "string") return top;
      const bottom = piece(raw.bottom as string, "bottom", outfitSlots.fullbody);
      if (typeof bottom === "string") return bottom;
      outfitSlots.fullbody = undefined;
      outfitSlots.top = top.id;
      outfitSlots.bottom = bottom.id;
    } else if (removing) {
      if (slot === "accessories") {
        const at = outfitSlots.accessories.indexOf(fromBlockId as string);
        if (at < 0) return "That day does not wear it.";
        outfitSlots.accessories.splice(at, 1);
      } else {
        if (!outfitSlots[slot as "layer" | "outerwear"]) return "That day has nothing there to take off.";
        outfitSlots[slot as "layer" | "outerwear"] = undefined;
      }
    } else if (slot === "accessories") {
      const from = typeof fromBlockId === "string" ? outfitSlots.accessories.indexOf(fromBlockId) : -1;
      const block = piece(toBlockId as string, "accessory", from >= 0 ? outfitSlots.accessories[from] : undefined);
      if (typeof block === "string") return block;
      if (from >= 0) outfitSlots.accessories[from] = block.id;
      else if (outfitSlots.accessories.length < 2) outfitSlots.accessories.push(block.id);
      else return "Two accessories a day at most: swap one.";
    } else {
      const outfitSlot = slot as OutfitSlot;
      const block = piece(toBlockId as string, SLOT_CATEGORY[outfitSlot], outfitSlots[outfitSlot]);
      if (typeof block === "string") return block;
      if (outfitSlot === "fullbody") {
        outfitSlots.fullbody = block.id;
        outfitSlots.top = undefined;
        outfitSlots.bottom = undefined;
      } else if (outfitSlot === "top" || outfitSlot === "bottom") {
        if (outfitSlots.fullbody) return "That day wears a full-body piece: swap it for a top and a bottom.";
        outfitSlots[outfitSlot] = block.id;
      } else {
        outfitSlots[outfitSlot] = block.id;
      }
    }

    const days = trip.plan.days.map((d, i) => (i === dayIndex ? { ...d, outfit: { ...d.outfit, slots: outfitSlots } } : d));
    // A piece swapped off the last day that wore it leaves the bag too: it
    // would only take up room. Spares never worn stay.
    const before = new Set(outfitBlockIds(day.outfit.slots));
    const stillWorn = new Set(days.flatMap((d) => outfitBlockIds(d.outfit.slots)));
    const packing = trip.plan.packing.filter((item) => !before.has(item.blockId) || stillWorn.has(item.blockId));
    const settled = settlePacking(days, packing, closet, trip.options, archived);
    return { plan: { ...trip.plan, days, packing: settled.packing, warnings: planWarnings(trip, days, closet, settled.warnings) } };
  }));
}

export async function deleteTripForUser(userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const deleted = await db
    .delete(trips)
    .where(and(eq(trips.id, id.toLowerCase()), eq(trips.userId, userId)))
    .returning({ id: trips.id });
  return deleted.length > 0;
}

