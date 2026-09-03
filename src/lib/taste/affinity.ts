import { outfitBlockIds, type Block } from "@/domain";
import type { BlockAffinity, OutfitEventLike, PairAffinity } from "./types";

/**
 * Block affinity: how much this person actually reaches for each piece.
 *
 * Pure and deterministic. The only time input is `opts.now`, which defaults to
 * the current clock so callers do not have to pass it and tests can.
 */

/** Half-life of a signal, in days. A six-month-old save counts about a quarter. */
export const DECAY_HALF_LIFE_DAYS = 90;

/** How much an event from another style counts towards a style-scoped profile. */
export const OTHER_STYLE_WEIGHT = 0.3;

/** Dislike reasons that are about the day, not about the pieces. */
const DAY_REASONS = new Set(["too-warm", "too-cold", "too-dressy", "too-casual"]);

const MS_PER_DAY = 86_400_000;

function toTime(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : Date.now();
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 0.5^(ageDays/90), clamped so a future timestamp cannot amplify a signal. */
export function recencyWeight(createdAt: Date | string, now: number): number {
  const ageDays = Math.max(0, (now - toTime(createdAt)) / MS_PER_DAY);
  return Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);
}

/**
 * Base score an event contributes to every piece in the outfit.
 * `swapped` is handled separately: it only touches the two blocks involved.
 */
function outfitScore(event: OutfitEventLike): number | null {
  switch (event.type) {
    case "saved":
      return 2;
    case "worn":
      return 3;
    case "liked":
      return 1;
    case "unsaved":
      return -1;
    case "disliked":
      // "One piece is off" tells us the outfit was wrong, not which piece; the
      // weather and formality reasons are about the day. Both land softer.
      if (event.reason === "wrong-piece" || (event.reason && DAY_REASONS.has(event.reason))) return -1;
      return -2;
    default:
      return null;
  }
}

function swapDetail(detail: unknown): { fromId?: string; toId?: string } {
  if (typeof detail !== "object" || detail === null) return {};
  const d = detail as { fromId?: unknown; toId?: unknown };
  return {
    fromId: typeof d.fromId === "string" && d.fromId ? d.fromId : undefined,
    toId: typeof d.toId === "string" && d.toId ? d.toId : undefined,
  };
}

function empty(blockId: string): BlockAffinity {
  return { blockId, score: 0, saves: 0, wears: 0, likes: 0, dislikes: 0, swapsIn: 0, swapsOut: 0 };
}

export interface AffinityOptions {
  /**
   * Scope. When set, events from that style count at full weight and every
   * other event counts at 0.3. When null or omitted, everything counts fully.
   */
  styleId?: string | null;
  /** Reference point for the recency decay. Defaults to now. */
  now?: Date | number;
}

/**
 * Scores every block that appears in the given events.
 *
 * Counts (`saves`, `wears`, …) are raw event counts, so they read honestly in a
 * summary line; the `score` is the decayed and style-weighted sum.
 */
export function computeAffinity(
  events: OutfitEventLike[],
  opts: AffinityOptions = {},
): Map<string, BlockAffinity> {
  const now = opts.now === undefined ? Date.now() : opts.now instanceof Date ? opts.now.getTime() : opts.now;
  const scope = opts.styleId ?? null;
  const out = new Map<string, BlockAffinity>();

  const at = (blockId: string): BlockAffinity => {
    let row = out.get(blockId);
    if (!row) {
      row = empty(blockId);
      out.set(blockId, row);
    }
    return row;
  };

  for (const event of events) {
    if (!event || typeof event !== "object" || !event.outfit?.slots) continue;
    const styleWeight = scope === null || (event.styleId ?? null) === scope ? 1 : OTHER_STYLE_WEIGHT;
    const weight = styleWeight * recencyWeight(event.createdAt, now);

    if (event.type === "swapped") {
      const { fromId, toId } = swapDetail(event.detail);
      if (fromId) {
        const row = at(fromId);
        row.score += -1.5 * weight;
        row.swapsOut += 1;
      }
      if (toId) {
        const row = at(toId);
        row.score += 1 * weight;
        row.swapsIn += 1;
      }
      continue;
    }

    const base = outfitScore(event);
    if (base === null) continue;

    for (const blockId of outfitBlockIds(event.outfit.slots)) {
      const row = at(blockId);
      row.score += base * weight;
      switch (event.type) {
        case "saved":
          row.saves += 1;
          break;
        case "worn":
          row.wears += 1;
          break;
        case "liked":
          row.likes += 1;
          break;
        case "disliked":
          row.dislikes += 1;
          break;
        default:
          break;
      }
    }
  }

  for (const row of out.values()) row.score = round(row.score);
  return out;
}

/**
 * The same scoring, applied to (top, bottom) pairs instead of single pieces.
 * Used only to name favourite combinations; swaps are ignored because a swap
 * says something about one piece, not about the pairing.
 */
export function pairAffinity(events: OutfitEventLike[], opts: AffinityOptions = {}): Map<string, PairAffinity> {
  const now = opts.now === undefined ? Date.now() : opts.now instanceof Date ? opts.now.getTime() : opts.now;
  const scope = opts.styleId ?? null;
  const out = new Map<string, PairAffinity>();

  for (const event of events) {
    if (!event || typeof event !== "object" || !event.outfit?.slots) continue;
    if (event.type === "swapped") continue;
    const base = outfitScore(event);
    if (base === null) continue;

    const { top, bottom } = event.outfit.slots;
    if (!top || !bottom) continue;

    const styleWeight = scope === null || (event.styleId ?? null) === scope ? 1 : OTHER_STYLE_WEIGHT;
    const weight = styleWeight * recencyWeight(event.createdAt, now);
    const key = `${top}+${bottom}`;
    const row = out.get(key) ?? { topId: top, bottomId: bottom, score: 0, count: 0 };
    row.score += base * weight;
    row.count += 1;
    out.set(key, row);
  }

  for (const row of out.values()) row.score = round(row.score);
  return out;
}

/* ------------------------------------------------------------------ */
/* Human-readable summaries                                            */
/* ------------------------------------------------------------------ */

/** How many lines each list gets, in the summary and in the profile. */
export const MAX_SUMMARY_LINES = 8;

function counts(row: BlockAffinity, direction: "up" | "down"): string {
  const parts: string[] = [];
  if (direction === "up") {
    if (row.wears) parts.push(`worn ${row.wears}×`);
    if (row.saves) parts.push(`saved ${row.saves}×`);
    if (row.likes) parts.push(`liked ${row.likes}×`);
    if (row.swapsIn) parts.push(`swapped in ${row.swapsIn}×`);
  } else {
    if (row.dislikes) parts.push(`disliked ${row.dislikes}×`);
    if (row.swapsOut) parts.push(`swapped out ${row.swapsOut}×`);
    if (row.wears) parts.push(`still worn ${row.wears}×`);
  }
  return parts.join(", ");
}

/** Sorted best first. */
export function topFavorites(aff: Map<string, BlockAffinity>, limit = MAX_SUMMARY_LINES): BlockAffinity[] {
  return [...aff.values()]
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (a.blockId < b.blockId ? -1 : 1))
    .slice(0, limit);
}

/** Sorted worst first. */
export function topSkipped(aff: Map<string, BlockAffinity>, limit = MAX_SUMMARY_LINES): BlockAffinity[] {
  return [...aff.values()]
    .filter((row) => row.score < 0)
    .sort((a, b) => a.score - b.score || (a.blockId < b.blockId ? -1 : 1))
    .slice(0, limit);
}

/**
 * Turns the affinity map into lines a person (and the summarizer) can read:
 * "Reaches for: white relaxed cotton t-shirt (worn 3×, saved 2×)".
 */
export function affinitySummaryLines(
  aff: Map<string, BlockAffinity>,
  blocks: readonly Pick<Block, "id" | "label">[],
): { favorites: string[]; avoid: string[] } {
  const labels = new Map(blocks.map((b) => [b.id, b.label]));
  const line = (row: BlockAffinity, direction: "up" | "down"): string | null => {
    const label = labels.get(row.blockId);
    if (!label) return null;
    const detail = counts(row, direction);
    const head = direction === "up" ? "Reaches for" : "Tends to skip";
    return detail ? `${head}: ${label} (${detail})` : `${head}: ${label}`;
  };

  return {
    favorites: topFavorites(aff)
      .map((row) => line(row, "up"))
      .filter((text): text is string => Boolean(text)),
    avoid: topSkipped(aff)
      .map((row) => line(row, "down"))
      .filter((text): text is string => Boolean(text)),
  };
}
