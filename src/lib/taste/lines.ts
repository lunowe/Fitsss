import type { TasteLine } from "./types";

/**
 * Taste line plumbing: stable ids, validation, and the merge that keeps what
 * the person told us while replacing what the model inferred.
 */

export const MIN_LINE_LENGTH = 3;
export const MAX_LINE_LENGTH = 120;
export const MAX_LEARNED_LINES = 12;
export const MAX_LEARNED_AVOID = 8;

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

/** Trims and caps a line the person typed. Returns null when it is unusable. */
export function normalizeLineText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < MIN_LINE_LENGTH || text.length > MAX_LINE_LENGTH) return null;
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
