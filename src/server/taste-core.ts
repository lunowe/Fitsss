import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { blocks, generations, outfitEvents, styles, tasteNotes } from "@/db/schema";
import { outfitBlockIds, type Outfit, type WeatherSnapshot } from "@/domain";
import { getLlmClient, isLlmConfigured, llmModel } from "@/lib/llm/client";
import { isUuid } from "@/lib/llm/generation-request";
import {
  MAX_LEARNED_AVOID,
  MAX_LINE_LENGTH,
  MIN_LINE_LENGTH,
  MAX_LEARNED_LINES,
  MAX_PROMPT_EVENTS,
  affinitySummaryLines,
  buildTastePrompt,
  computeAffinity,
  makeLine,
  mockTasteLines,
  mergeLines,
  normalizeLineText,
  parseTasteLines,
  tasteOutputSchema,
  topFavorites,
  topSkipped,
  type OutfitEventLike,
  type TasteEventForPrompt,
  type TasteLine,
  type TasteProfile,
} from "@/lib/taste";

/**
 * Taste memory, keyed by user id.
 *
 * Lives outside the "use server" boundary for the same reason generate-core
 * does: the server actions in taste.ts resolve the session and wrap these, and
 * scripts/try-taste.ts can drive them without a browser.
 */

/** Newest events considered. Older feedback has decayed to nothing anyway. */
export const MAX_EVENTS = 500;

/** Below this a "profile" would just be an echo of one afternoon. */
export const MIN_EVENTS_FOR_REFRESH = 3;

/** New events that make a refresh worth the call. */
export const REFRESH_EVENT_THRESHOLD = 5;

/** A profile older than this is refreshed as soon as anything new arrives. */
export const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_TOKENS = 2000;
const OVERALL = "__overall__";

export type TasteRefreshErrorCode = "not-configured" | "too-few-events" | "llm";

export type TasteRefreshResult =
  | { ok: true; profile: TasteProfile }
  | { ok: false; error: string; code: TasteRefreshErrorCode };

export type TasteLineResult = { ok: true; profile: TasteProfile } | { ok: false; errors: string[] };

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

interface TasteEventRow extends OutfitEventLike {
  occasion: string | null;
  tempC: number | null;
}

interface NotesRow {
  lines: TasteLine[];
  avoid: TasteLine[];
  eventCount: number;
  lastRefreshedAt: Date | null;
}

interface TasteContext {
  events: TasteEventRow[];
  /** Every block the user owns, archived included: labels outlive the closet. */
  blocks: { id: string; label: string }[];
  /** Keyed by style id, or `__overall__`. */
  notes: Map<string, NotesRow>;
  activeStyles: { id: string; name: string; description: string }[];
  styleById: Map<string, { id: string; name: string; description: string }>;
}

function tempOf(request: unknown): number | null {
  if (typeof request !== "object" || request === null) return null;
  const weather = (request as { weather?: WeatherSnapshot }).weather;
  if (!weather || typeof weather !== "object") return null;
  const value = weather.feelsLikeC ?? weather.tempC;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function loadTasteContext(userId: string): Promise<TasteContext> {
  const [eventRows, blockRows, noteRows, styleRows] = await Promise.all([
    db
      .select({
        type: outfitEvents.type,
        outfit: outfitEvents.outfit,
        reason: outfitEvents.reason,
        detail: outfitEvents.detail,
        styleId: outfitEvents.styleId,
        occasion: outfitEvents.occasion,
        createdAt: outfitEvents.createdAt,
        request: generations.request,
      })
      .from(outfitEvents)
      .leftJoin(generations, eq(outfitEvents.generationId, generations.id))
      .where(eq(outfitEvents.userId, userId))
      .orderBy(desc(outfitEvents.createdAt))
      .limit(MAX_EVENTS),
    db.select({ id: blocks.id, label: blocks.label }).from(blocks).where(eq(blocks.userId, userId)),
    db
      .select({
        styleId: tasteNotes.styleId,
        lines: tasteNotes.lines,
        avoid: tasteNotes.avoid,
        eventCount: tasteNotes.eventCount,
        lastRefreshedAt: tasteNotes.lastRefreshedAt,
      })
      .from(tasteNotes)
      .where(eq(tasteNotes.userId, userId)),
    db
      .select({ id: styles.id, name: styles.name, description: styles.description, archivedAt: styles.archivedAt })
      .from(styles)
      .where(eq(styles.userId, userId)),
  ]);

  // Oldest first: the summarizer and the decay both read chronologically.
  const events: TasteEventRow[] = eventRows
    .map((row) => ({
      type: row.type,
      outfit: row.outfit as Outfit,
      reason: row.reason,
      detail: row.detail,
      styleId: row.styleId,
      occasion: row.occasion,
      createdAt: row.createdAt,
      tempC: tempOf(row.request),
    }))
    .reverse();

  const notes = new Map<string, NotesRow>();
  for (const row of noteRows) {
    notes.set(row.styleId ?? OVERALL, {
      lines: parseTasteLines(row.lines),
      avoid: parseTasteLines(row.avoid),
      eventCount: row.eventCount,
      lastRefreshedAt: row.lastRefreshedAt,
    });
  }

  const styleById = new Map(
    styleRows.map((row) => [row.id, { id: row.id, name: row.name, description: row.description }]),
  );

  return {
    events,
    blocks: blockRows,
    notes,
    activeStyles: styleRows
      .filter((row) => !row.archivedAt)
      .map((row) => ({ id: row.id, name: row.name, description: row.description })),
    styleById,
  };
}

/* ------------------------------------------------------------------ */
/* Assembling a profile                                                */
/* ------------------------------------------------------------------ */

const EMPTY_NOTES: NotesRow = { lines: [], avoid: [], eventCount: 0, lastRefreshedAt: null };

function scopedEvents(ctx: TasteContext, styleId: string | null): TasteEventRow[] {
  if (!styleId) return ctx.events;
  return ctx.events.filter((event) => (event.styleId ?? null) === styleId);
}

function profileFrom(ctx: TasteContext, styleId: string | null): TasteProfile {
  const notes = ctx.notes.get(styleId ?? OVERALL) ?? EMPTY_NOTES;
  const aff = computeAffinity(ctx.events, { styleId });
  return {
    styleId,
    lines: notes.lines,
    avoid: notes.avoid,
    eventCount: notes.eventCount,
    totalEvents: scopedEvents(ctx, styleId).length,
    lastRefreshedAt: notes.lastRefreshedAt ? notes.lastRefreshedAt.toISOString() : null,
    favorites: topFavorites(aff),
    skipped: topSkipped(aff),
  };
}

export async function getTasteProfileForUser(
  userId: string,
  styleId: string | null,
): Promise<TasteProfile> {
  const ctx = await loadTasteContext(userId);
  return profileFrom(ctx, isUuid(styleId) ? styleId : null);
}

export async function getTasteOverviewForUser(userId: string): Promise<{
  overall: TasteProfile;
  byStyle: Record<string, TasteProfile>;
  totalEvents: number;
}> {
  const ctx = await loadTasteContext(userId);
  const byStyle: Record<string, TasteProfile> = {};
  for (const style of ctx.activeStyles) byStyle[style.id] = profileFrom(ctx, style.id);
  return { overall: profileFrom(ctx, null), byStyle, totalEvents: ctx.events.length };
}

/* ------------------------------------------------------------------ */
/* Prompt text for the generator                                       */
/* ------------------------------------------------------------------ */

function bulletsFor(notes: NotesRow): string[] {
  return notes.lines.map((line) => `- ${line.text}`);
}

function renderTasteNotes(ctx: TasteContext, styleId: string | null): string | undefined {
  const overall = ctx.notes.get(OVERALL) ?? EMPTY_NOTES;
  const style = styleId ? ctx.notes.get(styleId) ?? EMPTY_NOTES : EMPTY_NOTES;

  const sections: string[] = [];
  const overallLines = bulletsFor(overall);
  if (overallLines.length) sections.push(["Learned preferences (overall)", ...overallLines].join("\n"));

  const styleLines = bulletsFor(style);
  if (styleLines.length) sections.push(["For this style", ...styleLines].join("\n"));

  const avoid: string[] = [];
  const seen = new Set<string>();
  for (const line of [...overall.avoid, ...style.avoid]) {
    if (seen.has(line.id)) continue;
    seen.add(line.id);
    avoid.push(`- ${line.text}`);
  }
  if (avoid.length) sections.push(["Avoid", ...avoid].join("\n"));

  const summary = affinitySummaryLines(computeAffinity(ctx.events, { styleId }), ctx.blocks);
  const counted = [...summary.favorites, ...summary.avoid];
  if (counted.length) sections.push(counted.join("\n"));

  return sections.length ? sections.join("\n\n") : undefined;
}

/**
 * The "what this person tends to like" block of the generation prompt.
 * Undefined when we have learned nothing yet, so the prompt stays clean.
 */
export async function tasteNotesForPrompt(
  userId: string,
  styleId: string | null,
): Promise<string | undefined> {
  try {
    const ctx = await loadTasteContext(userId);
    return renderTasteNotes(ctx, isUuid(styleId) ? styleId : null);
  } catch (error) {
    console.warn("[taste] could not load taste notes for the prompt:", error);
    return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

interface NotesPatch {
  lines?: TasteLine[];
  avoid?: TasteLine[];
  eventCount?: number;
  lastRefreshedAt?: Date;
  model?: string;
}

function scopeWhere(userId: string, styleId: string | null) {
  return and(
    eq(tasteNotes.userId, userId),
    styleId ? eq(tasteNotes.styleId, styleId) : isNull(tasteNotes.styleId),
  );
}

/**
 * Upsert against the `coalesce(style_id, …)` unique index. Drizzle cannot name
 * an expression index as a conflict target, so this updates first and inserts
 * only when there was nothing to update.
 */
async function upsertNotes(userId: string, styleId: string | null, patch: NotesPatch): Promise<void> {
  const now = new Date();
  const [updated] = await db
    .update(tasteNotes)
    .set({ ...patch, updatedAt: now })
    .where(scopeWhere(userId, styleId))
    .returning({ id: tasteNotes.id });
  if (updated) return;

  try {
    await db.insert(tasteNotes).values({
      userId,
      styleId,
      lines: patch.lines ?? [],
      avoid: patch.avoid ?? [],
      eventCount: patch.eventCount ?? 0,
      lastRefreshedAt: patch.lastRefreshedAt ?? null,
      model: patch.model ?? null,
    });
  } catch {
    // Someone inserted the row between the update and the insert.
    await db.update(tasteNotes).set({ ...patch, updatedAt: now }).where(scopeWhere(userId, styleId));
  }
}

/* ------------------------------------------------------------------ */
/* Refresh                                                             */
/* ------------------------------------------------------------------ */

function describeLlmError(error: unknown): { error: string; code: TasteRefreshErrorCode } {
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      code: "not-configured",
      error: "Could not sign in to the Claude API. Check that ANTHROPIC_API_KEY is set and valid.",
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { code: "llm", error: "Rate limited right now. Try again in a moment." };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { code: "llm", error: "Could not reach the Claude API. Check your connection and try again." };
  }
  if (error instanceof Anthropic.APIError) {
    return { code: "llm", error: `The Claude API returned an error (${error.status ?? "unknown"}).` };
  }
  return { code: "llm", error: "Could not update your taste notes. Try again." };
}

/** Labels in display order for one event's outfit. */
function labelsFor(event: TasteEventRow, labels: Map<string, string>): string[] {
  return outfitBlockIds(event.outfit.slots)
    .map((id) => labels.get(id))
    .filter((label): label is string => Boolean(label));
}

function promptEvents(events: TasteEventRow[], labels: Map<string, string>): TasteEventForPrompt[] {
  return events.slice(-MAX_PROMPT_EVENTS).map((event) => ({
    createdAt: event.createdAt,
    type: event.type,
    occasion: event.occasion,
    tempC: event.tempC,
    labels: labelsFor(event, labels),
    reason: event.reason ?? null,
  }));
}

export async function refreshTasteNotesForUser(
  userId: string,
  styleId: string | null,
): Promise<TasteRefreshResult> {
  const mock = process.env.LLM_MOCK === "1";
  const scope = isUuid(styleId) ? styleId : null;

  const ctx = await loadTasteContext(userId);
  if (scope && !ctx.styleById.has(scope)) {
    return { ok: false, code: "too-few-events", error: "That style is gone." };
  }

  const inScope = scopedEvents(ctx, scope);
  if (inScope.length < MIN_EVENTS_FOR_REFRESH) {
    const missing = MIN_EVENTS_FOR_REFRESH - inScope.length;
    return {
      ok: false,
      code: "too-few-events",
      error: scope
        ? `Not enough feedback for this style yet. Save, wear or rate ${missing} more outfit${missing === 1 ? "" : "s"} in it.`
        : `Not enough feedback yet. Save, wear or rate ${missing} more outfit${missing === 1 ? "" : "s"} and I can start learning.`,
    };
  }

  if (!mock && !isLlmConfigured()) {
    return {
      ok: false,
      code: "not-configured",
      error: "No Claude API key yet. Add ANTHROPIC_API_KEY to .env.local to learn your taste.",
    };
  }

  const existing = ctx.notes.get(scope ?? OVERALL) ?? EMPTY_NOTES;
  const labels = new Map(ctx.blocks.map((b) => [b.id, b.label]));
  const aff = computeAffinity(ctx.events, { styleId: scope });
  const summary = affinitySummaryLines(aff, ctx.blocks);

  let produced: { lines: { text: string; evidence?: number }[]; avoid: { text: string; evidence?: number }[] };
  let model: string;

  if (mock) {
    produced = mockTasteLines(aff, labels);
    model = "mock";
  } else {
    model = llmModel();
    const style = scope ? ctx.styleById.get(scope) : undefined;
    const prompt = buildTastePrompt({
      scope: style ? { styleName: style.name, styleDescription: style.description } : null,
      learned: existing.lines.filter((line) => line.source === "learned"),
      learnedAvoid: existing.avoid.filter((line) => line.source === "learned"),
      userLines: existing.lines.filter((line) => line.source === "user"),
      userAvoid: existing.avoid.filter((line) => line.source === "user"),
      affinity: summary,
      events: promptEvents(inScope, labels),
    });

    let message;
    try {
      message = await getLlmClient().messages.parse({
        model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "low",
          format: zodOutputFormat(tasteOutputSchema),
        },
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
    } catch (error) {
      return { ok: false, ...describeLlmError(error) };
    }

    if (message.stop_reason === "refusal") {
      return { ok: false, code: "llm", error: "The summarizer declined this request." };
    }
    const parsed = message.parsed_output;
    if (!parsed) {
      return { ok: false, code: "llm", error: "The summarizer returned nothing usable. Try again." };
    }
    produced = { lines: parsed.lines, avoid: parsed.avoid };
  }

  const refreshedAt = new Date();
  const nowIso = refreshedAt.toISOString();
  const lines = mergeLines(existing.lines, produced.lines, nowIso, MAX_LEARNED_LINES);
  const avoid = mergeLines(existing.avoid, produced.avoid, nowIso, MAX_LEARNED_AVOID);

  await upsertNotes(userId, scope, {
    lines,
    avoid,
    eventCount: inScope.length,
    lastRefreshedAt: refreshedAt,
    model,
  });

  return {
    ok: true,
    profile: {
      styleId: scope,
      lines,
      avoid,
      eventCount: inScope.length,
      totalEvents: inScope.length,
      lastRefreshedAt: nowIso,
      favorites: topFavorites(aff),
      skipped: topSkipped(aff),
    },
  };
}

/**
 * Refreshes only when it is worth a model call: five new events since the last
 * refresh, or a profile older than a week with anything new at all.
 */
export async function maybeRefreshTasteNotesForUser(
  userId: string,
  styleId: string | null,
): Promise<boolean> {
  const profile = await getTasteProfileForUser(userId, styleId);
  const fresh = profile.totalEvents - profile.eventCount;
  if (fresh <= 0) return false;

  const age = profile.lastRefreshedAt ? Date.now() - Date.parse(profile.lastRefreshedAt) : Infinity;
  const due = fresh >= REFRESH_EVENT_THRESHOLD || age > REFRESH_MAX_AGE_MS;
  if (!due) return false;

  const result = await refreshTasteNotesForUser(userId, styleId);
  return result.ok;
}

/**
 * Fire-and-forget wrapper for `after()`: learning from an event may never turn
 * into a failed save.
 */
export async function refreshTasteAfterEvent(userId: string, styleId: string | null): Promise<void> {
  try {
    if (styleId) await maybeRefreshTasteNotesForUser(userId, styleId);
    await maybeRefreshTasteNotesForUser(userId, null);
  } catch (error) {
    console.warn("[taste] background refresh failed:", error);
  }
}

/* ------------------------------------------------------------------ */
/* User-stated lines                                                   */
/* ------------------------------------------------------------------ */

export async function addTasteLineForUser(
  userId: string,
  input: { styleId: string | null; text: string; kind: "like" | "avoid" },
): Promise<TasteLineResult> {
  const scope = isUuid(input?.styleId) ? input.styleId : null;
  const kind = input?.kind === "avoid" ? "avoid" : "like";
  const text = normalizeLineText(input?.text);
  if (!text) {
    return {
      ok: false,
      errors: [`Write between ${MIN_LINE_LENGTH} and ${MAX_LINE_LENGTH} characters.`],
    };
  }

  const ctx = await loadTasteContext(userId);
  if (scope && !ctx.styleById.has(scope)) return { ok: false, errors: ["That style is gone."] };

  const existing = ctx.notes.get(scope ?? OVERALL) ?? EMPTY_NOTES;
  const line = makeLine(text, "user", undefined, new Date().toISOString());
  const list = kind === "avoid" ? existing.avoid : existing.lines;
  if (list.some((l) => l.id === line.id)) {
    return { ok: false, errors: ["That is already in your notes."] };
  }

  const next = [line, ...list];
  await upsertNotes(userId, scope, kind === "avoid" ? { avoid: next } : { lines: next });

  ctx.notes.set(scope ?? OVERALL, {
    ...existing,
    lines: kind === "avoid" ? existing.lines : next,
    avoid: kind === "avoid" ? next : existing.avoid,
  });
  return { ok: true, profile: profileFrom(ctx, scope) };
}

export async function removeTasteLineForUser(
  userId: string,
  input: { styleId: string | null; lineId: string },
): Promise<TasteLineResult> {
  const scope = isUuid(input?.styleId) ? input.styleId : null;
  const lineId = typeof input?.lineId === "string" ? input.lineId.trim() : "";
  if (!lineId) return { ok: false, errors: ["Nothing to remove."] };

  const ctx = await loadTasteContext(userId);
  const existing = ctx.notes.get(scope ?? OVERALL) ?? EMPTY_NOTES;
  const lines = existing.lines.filter((line) => line.id !== lineId);
  const avoid = existing.avoid.filter((line) => line.id !== lineId);
  if (lines.length === existing.lines.length && avoid.length === existing.avoid.length) {
    return { ok: false, errors: ["That note is already gone."] };
  }

  await upsertNotes(userId, scope, { lines, avoid });
  ctx.notes.set(scope ?? OVERALL, { ...existing, lines, avoid });
  return { ok: true, profile: profileFrom(ctx, scope) };
}
