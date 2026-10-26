import { cleanText, hasVisibleText, textLength } from "@/domain/text";
import type { TasteLine } from "./types";

/**
 * Taste line plumbing: stable ids, validation, and the merge that keeps what
 * the person told us while replacing what the model inferred.
 */

export const MIN_LINE_LENGTH = 3;
export const MAX_LINE_LENGTH = 120;
export const MAX_LEARNED_LINES = 12;
export const MAX_LEARNED_AVOID = 8;
/** Lines the person writes, per list: every one goes into every outfit prompt. */
export const MAX_USER_LINES = 30;
/** Deleted learned lines remembered, so a refresh does not bring them back. */
export const MAX_DISMISSED = 100;

/** FNV-1a over the normalized text. Same text in, same id out, forever. */
export function lineId(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

/**
 * Cleans and checks a line (typed by the person or written by the model).
 * Returns null when it is unusable: too short or long in characters (code
 * points, as the app counts them), or nothing but invisible ones.
 */
export function normalizeLineText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = cleanText(value).replace(/\s+/g, " ").trim();
  const length = textLength(text);
  if (length < MIN_LINE_LENGTH || length > MAX_LINE_LENGTH || !hasVisibleText(text)) return null;
  return text;
}

export function makeLine(
  text: string,
  source: TasteLine["source"],
  evidence: number | undefined,
  createdAt: string,
): TasteLine {
  const line: TasteLine = { id: lineId(text), text, source, createdAt };
  if (typeof evidence === "number" && Number.isFinite(evidence) && evidence > 0) {
    line.evidence = Math.round(evidence);
  }
  return line;
}

/** Reads a jsonb column back into TasteLine[], dropping anything malformed. */
export function parseTasteLines(value: unknown): TasteLine[] {
  if (!Array.isArray(value)) return [];
  const out: TasteLine[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Partial<TasteLine>;
    const text = normalizeLineText(r.text);
    if (!text) continue;
    const id = typeof r.id === "string" && r.id ? r.id : lineId(text);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      text,
      source: r.source === "user" ? "user" : "learned",
      ...(typeof r.evidence === "number" && Number.isFinite(r.evidence) ? { evidence: r.evidence } : {}),
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(0).toISOString(),
    });
  }
  return out;
}

/**
 * Replaces the learned half of a list with a fresh set while keeping every
 * user-stated line untouched and first. A learned line that repeats something
 * the person already said is dropped rather than duplicated.
 */
export function mergeLines(
  existing: TasteLine[],
  learned: { text: string; evidence?: number }[],
  now: string,
  limit: number,
): TasteLine[] {
  const kept = existing.filter((line) => line.source === "user");
  const takenIds = new Set(kept.map((line) => line.id));
  const previousById = new Map(existing.map((line) => [line.id, line]));

  const next: TasteLine[] = [...kept];
  for (const candidate of learned) {
    const text = normalizeLineText(candidate.text);
    if (!text) continue;
    const id = lineId(text);
    if (takenIds.has(id)) continue;
    takenIds.add(id);
    const before = previousById.get(id);
    next.push(makeLine(text, "learned", candidate.evidence, before?.createdAt ?? now));
    if (next.length - kept.length >= limit) break;
  }
  return next;
}

/**
 * The learned lines a refresh may still write, given the notes when it
 * started (`before`) and now (`now`, both lists). Dropped:
 * - lines deleted while the model was thinking: the model saw them and may
 *   well hand them back, but they stay deleted;
 * - lines deleted before (`dismissed`): the person said they were wrong;
 * - anything the person said themselves, in either list: their words win, so
 *   "Earth tones" moved from a learned like to their own avoid is not also
 *   written back as a like;
 * - anything in `taken` (the other list, merged first), so no id is in both
 *   lists and deleting a line by id deletes exactly one.
 */
export function refreshCandidates<T extends { text: string }>(
  candidates: T[],
  before: TasteLine[],
  now: TasteLine[],
  options: { dismissed?: TasteLine[]; taken?: TasteLine[] } = {},
): T[] {
  const still = new Set(now.map((line) => line.id));
  const blocked = new Set([
    ...before.map((line) => line.id).filter((id) => !still.has(id)),
    ...now.filter((line) => line.source === "user").map((line) => line.id),
    ...(options.dismissed ?? []).map((line) => line.id),
    ...(options.taken ?? []).map((line) => line.id),
  ]);
  if (blocked.size === 0) return candidates;
  return candidates.filter((candidate) => {
    const text = normalizeLineText(candidate.text);
    return !text || !blocked.has(lineId(text));
  });
}
