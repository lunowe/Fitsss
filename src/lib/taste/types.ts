import type { Outfit } from "@/domain";

/**
 * Taste memory: what we have learned about one person from their outfit
 * feedback, plus whatever they told us directly.
 *
 * Everything in src/lib/taste is pure TypeScript — no database, no SDK calls,
 * no clock unless it is passed in — so it can be unit tested and reused by the
 * server actions in src/server/taste*.ts.
 */

/** One observation about this person's taste. */
export interface TasteLine {
  /** Stable id derived from the text, so a refresh keeps ids steady. */
  id: string;
  text: string;
  /** "learned" comes from the summarizer, "user" was typed by the person. */
  source: "learned" | "user";
  /** How many events back this line, when known. */
  evidence?: number;
  /** ISO timestamp. */
  createdAt: string;
}

/** How much one block is liked, with the raw counts behind the score. */
export interface BlockAffinity {
  blockId: string;
  /** Recency-decayed, style-weighted sum. Positive is liked, negative is skipped. */
  score: number;
  saves: number;
  wears: number;
  likes: number;
  dislikes: number;
  swapsIn: number;
  swapsOut: number;
}

/** The whole taste picture for one scope: overall (styleId null) or one style. */
export interface TasteProfile {
  styleId: string | null;
  /** Things this person tends to like. */
  lines: TasteLine[];
  /** Things to avoid. */
  avoid: TasteLine[];
  /** Events considered at the last refresh. */
  eventCount: number;
  /** Events available now, for staleness display. */
  totalEvents: number;
  lastRefreshedAt: string | null;
  /** Top 8 by score desc, score > 0. */
  favorites: BlockAffinity[];
  /** Bottom 8 by score asc, score < 0. */
  skipped: BlockAffinity[];
}

/**
 * The shape `computeAffinity` needs from an outfit event. Matches the
 * `outfit_events` row without dragging the database types into pure code.
 */
export interface OutfitEventLike {
  type: string;
  outfit: Outfit;
  reason?: string | null;
  /** For "swapped": `{ slot, fromId, toId }`. */
  detail?: unknown;
  styleId?: string | null;
  createdAt: Date | string;
}

/** A (top, bottom) pair the person keeps coming back to. */
export interface PairAffinity {
  topId: string;
  bottomId: string;
  score: number;
  count: number;
}
