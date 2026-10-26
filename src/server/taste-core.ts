import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, generations, outfitEvents, styles, tasteNotes } from "@/db/schema";
import { outfitBlockIds, type Outfit, type WeatherSnapshot } from "@/domain";
import { callStructured, providerConfigured, type StructuredErrorCode } from "@/lib/llm/provider";
import { isUuid } from "@/lib/llm/generation-request";
import { getLlmSettingsForUser } from "@/server/settings-queries";
import {
  MAX_DISMISSED,
  MAX_LEARNED_AVOID,
  MAX_USER_LINES,
  MAX_LINE_LENGTH,
  MIN_LINE_LENGTH,
  MAX_LEARNED_LINES,
  MAX_PROMPT_EVENTS,
  TASTE_SYSTEM_PROMPT,
  affinitySummaryLines,
  buildTasteUserMessage,
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
  refreshCandidates,
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

/** A style id as stored (lowercase), or null for the overall scope. */
function scopeOf(styleId: unknown): string | null {
  return isUuid(styleId) ? styleId.toLowerCase() : null;
}

/** Deleted styles are archived; their scope takes no new notes. */
function isActiveStyle(ctx: TasteContext, styleId: string): boolean {
  return ctx.activeStyles.some((style) => style.id === styleId);
}

export type TasteRefreshErrorCode = "not-configured" | "too-few-events" | "llm" | "not-found";

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
  /** Learned lines the person deleted; see `refreshCandidates`. */
  dismissed: TasteLine[];
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
        dismissed: tasteNotes.dismissed,
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
      dismissed: parseTasteLines(row.dismissed),
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

const EMPTY_NOTES: NotesRow = { lines: [], avoid: [], dismissed: [], eventCount: 0, lastRefreshedAt: null };

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
  return profileFrom(ctx, scopeOf(styleId));
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
    return renderTasteNotes(ctx, scopeOf(styleId));
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
  dismissed?: TasteLine[];
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
 * Read-modify-write of one scope's notes, holding a lock on that scope.
 * `change` sees the notes as they are now (not as they were when the caller
 * started), so a line added while a refresh waits on the model survives the
 * refresh's write, and two adds both land. It returns the patch, or null to
 * leave the notes alone, or a string to refuse. Answers with the notes as
 * stored afterwards.
 *
 * Upserts by hand: Drizzle cannot name the `coalesce(style_id, …)` unique
 * index as a conflict target, and under the lock nothing can insert between
 * the update and the insert anyway.
 */
async function changeNotes(
  userId: string,
  styleId: string | null,
  change: (current: NotesRow) => NotesPatch | null | string,
): Promise<{ ok: true; notes: NotesRow } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`taste:${userId}:${styleId ?? OVERALL}`}))`);
    const [row] = await tx
      .select({
        lines: tasteNotes.lines,
        avoid: tasteNotes.avoid,
        dismissed: tasteNotes.dismissed,
        eventCount: tasteNotes.eventCount,
        lastRefreshedAt: tasteNotes.lastRefreshedAt,
      })
      .from(tasteNotes)
      .where(scopeWhere(userId, styleId))
      .limit(1);
    const current: NotesRow = row
      ? {
          lines: parseTasteLines(row.lines),
          avoid: parseTasteLines(row.avoid),
          dismissed: parseTasteLines(row.dismissed),
          eventCount: row.eventCount,
          lastRefreshedAt: row.lastRefreshedAt,
        }
      : EMPTY_NOTES;

    const patch = change(current);
    if (typeof patch === "string") return { ok: false, error: patch };
    if (patch === null) return { ok: true, notes: current };

    const now = new Date();
    if (row) {
      await tx.update(tasteNotes).set({ ...patch, updatedAt: now }).where(scopeWhere(userId, styleId));
    } else {
      await tx.insert(tasteNotes).values({
        userId,
        styleId,
        lines: patch.lines ?? [],
        avoid: patch.avoid ?? [],
        dismissed: patch.dismissed ?? [],
        eventCount: patch.eventCount ?? 0,
        lastRefreshedAt: patch.lastRefreshedAt ?? null,
        model: patch.model ?? null,
      });
    }
    return {
      ok: true,
      notes: {
        lines: patch.lines ?? current.lines,
        avoid: patch.avoid ?? current.avoid,
        dismissed: patch.dismissed ?? current.dismissed,
        eventCount: patch.eventCount ?? current.eventCount,
        lastRefreshedAt: patch.lastRefreshedAt ?? current.lastRefreshedAt,
      },
    };
  });
}

/* ------------------------------------------------------------------ */
/* Refresh                                                             */
/* ------------------------------------------------------------------ */

/** Provider codes, narrowed to the two this screen distinguishes. */
function toTasteCode(code: StructuredErrorCode): TasteRefreshErrorCode {
  return code === "not-configured" ? "not-configured" : "llm";
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
  // A refresh asked for while one is waiting on the model (the button
  // pressed twice, the background refresh after an event) shares its answer.
  const scope = scopeOf(styleId);
  const key = `${userId}:${scope ?? OVERALL}`;
  const running = refreshing.get(key);
  if (running) return running;
  const refresh = runRefresh(userId, scope).finally(() => refreshing.delete(key));
  refreshing.set(key, refresh);
  return refresh;
}

/** Refreshes in progress in this process, by user and scope. */
const refreshing = new Map<string, Promise<TasteRefreshResult>>();

async function runRefresh(userId: string, scope: string | null): Promise<TasteRefreshResult> {
  const llm = await getLlmSettingsForUser(userId);
  const mock = llm.provider === "mock";

  const ctx = await loadTasteContext(userId);
  if (scope && !isActiveStyle(ctx, scope)) {
    return { ok: false, code: "not-found", error: "That style is gone." };
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

  if (!mock) {
    const configured = providerConfigured(llm);
    if (!configured.ok) return { ok: false, code: "not-configured", error: configured.error };
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
    const style = scope ? ctx.styleById.get(scope) : undefined;
    const user = buildTasteUserMessage({
      scope: style ? { styleName: style.name, styleDescription: style.description } : null,
      learned: existing.lines.filter((line) => line.source === "learned"),
      learnedAvoid: existing.avoid.filter((line) => line.source === "learned"),
      userLines: existing.lines.filter((line) => line.source === "user"),
      userAvoid: existing.avoid.filter((line) => line.source === "user"),
      dismissed: existing.dismissed,
      affinity: summary,
      events: promptEvents(inScope, labels),
    });

    const answer = await callStructured(
      {
        task: "taste",
        system: TASTE_SYSTEM_PROMPT,
        user,
        schema: tasteOutputSchema,
        schemaName: "taste_profile",
        maxTokens: MAX_TOKENS,
        // Summarising a list of events is not the expensive kind of thinking.
        effort: "low",
      },
      llm,
    );

    if (!answer.ok) {
      return { ok: false, code: toTasteCode(answer.code), error: answer.error };
    }

    model = answer.model;
    produced = { lines: answer.value.lines, avoid: answer.value.avoid };
  }

  const refreshedAt = new Date();
  const nowIso = refreshedAt.toISOString();
  // Merged into the notes as they are now: the person may have added or
  // removed a line while the model was thinking.
  const written = await changeNotes(userId, scope, (current) => {
    const before = [...existing.lines, ...existing.avoid];
    const now = [...current.lines, ...current.avoid];
    const dismissed = current.dismissed;
    const lines = mergeLines(
      current.lines,
      refreshCandidates(produced.lines, before, now, { dismissed }),
      nowIso,
      MAX_LEARNED_LINES,
    );
    const avoid = mergeLines(
      current.avoid,
      refreshCandidates(produced.avoid, before, now, { dismissed, taken: lines }),
      nowIso,
      MAX_LEARNED_AVOID,
    );
    return { lines, avoid, eventCount: inScope.length, lastRefreshedAt: refreshedAt, model };
  });
  if (!written.ok) return { ok: false, code: "llm", error: written.error };

  return {
    ok: true,
    profile: {
      styleId: scope,
      lines: written.notes.lines,
      avoid: written.notes.avoid,
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
  const scope = scopeOf(input?.styleId);
  const kind = input?.kind === "avoid" ? "avoid" : "like";
  const text = normalizeLineText(input?.text);
  if (!text) {
    return {
      ok: false,
      errors: [`Write between ${MIN_LINE_LENGTH} and ${MAX_LINE_LENGTH} characters.`],
    };
  }

  const ctx = await loadTasteContext(userId);
  if (scope && !isActiveStyle(ctx, scope)) return { ok: false, errors: ["That style is gone."] };

  const line = makeLine(text, "user", undefined, new Date().toISOString());
  const written = await changeNotes(userId, scope, (current) => {
    const list = kind === "avoid" ? current.avoid : current.lines;
    const other = kind === "avoid" ? current.lines : current.avoid;
    if (list.some((l) => l.id === line.id)) return "That is already in your notes.";
    // One id in both lists would make deleting one delete both, and a like
    // that is also an avoid tells the stylist nothing.
    if (other.some((l) => l.id === line.id)) {
      return kind === "avoid"
        ? "That is in your likes. Delete it there first."
        : "That is in what to avoid. Delete it there first.";
    }
    if (list.filter((l) => l.source === "user").length >= MAX_USER_LINES) {
      return `You have ${MAX_USER_LINES} of your own lines here. Delete one first.`;
    }
    return kind === "avoid" ? { avoid: [line, ...list] } : { lines: [line, ...list] };
  });
  if (!written.ok) return { ok: false, errors: [written.error] };

  ctx.notes.set(scope ?? OVERALL, written.notes);
  return { ok: true, profile: profileFrom(ctx, scope) };
}

/**
 * Removes a line from either list. A line that is already gone counts as
 * removed: the notes come back as they are.
 */
export async function removeTasteLineForUser(
  userId: string,
  input: { styleId: string | null; lineId: string },
): Promise<TasteLineResult> {
  const scope = scopeOf(input?.styleId);
  const lineId = typeof input?.lineId === "string" ? input.lineId.trim() : "";
  if (!lineId) return { ok: false, errors: ["Nothing to remove."] };

  const ctx = await loadTasteContext(userId);
  const written = await changeNotes(userId, scope, (current) => {
    const removed = [...current.lines, ...current.avoid].filter((line) => line.id === lineId);
    if (removed.length === 0) return null;
    // A learned line deleted is a learned line that was wrong: remembered,
    // so the next refresh does not write it back.
    const learned = removed.filter((line) => line.source === "learned");
    return {
      lines: current.lines.filter((line) => line.id !== lineId),
      avoid: current.avoid.filter((line) => line.id !== lineId),
      ...(learned.length
        ? {
            dismissed: [...learned, ...current.dismissed.filter((line) => line.id !== lineId)].slice(
              0,
              MAX_DISMISSED,
            ),
          }
        : {}),
    };
  });
  if (!written.ok) return { ok: false, errors: [written.error] };

  ctx.notes.set(scope ?? OVERALL, written.notes);
  return { ok: true, profile: profileFrom(ctx, scope) };
}
