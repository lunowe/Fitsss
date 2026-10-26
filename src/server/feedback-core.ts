import "server-only";

import { after } from "next/server";
import { db } from "@/db";
import { outfitEvents } from "@/db/schema";
import { DISLIKE_REASONS, OUTFIT_EVENT_TYPES, type Outfit, type OutfitEventType } from "@/domain";
import { ownedRefs } from "@/server/owned-refs";
import { validateSaveLookInput } from "@/server/looks-validate";
import { refreshTasteAfterEvent } from "@/server/taste-core";

/**
 * Every signal the user gives about an outfit lands here: saved, liked,
 * disliked (with a reason), worn, swapped, unsaved. Phase 3 reads these back
 * as taste notes, so the snapshot is stored whole.
 */

export type RecordOutfitEventInput = {
  type: OutfitEventType;
  outfit: Outfit;
  reason?: string;
  styleId?: string;
  occasion?: string;
  generationId?: string;
  lookId?: string;
};

/** At most this much JSON per event; a real outfit snapshot is well under 2 KB. */
const MAX_EVENT_BYTES = 16_000;

/**
 * Records one event. The outfit is validated and cleaned like a saved look's
 * (piece ids, text), references are kept only when they are the user's own,
 * and anything else is refused rather than stored.
 */
export async function recordOutfitEventForUser(
  userId: string,
  input: RecordOutfitEventInput | unknown,
): Promise<{ ok: boolean }> {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const { type, reason } = raw;

  if (typeof type !== "string" || !(OUTFIT_EVENT_TYPES as readonly string[]).includes(type)) {
    return { ok: false };
  }

  let size = 0;
  try {
    size = JSON.stringify(raw.outfit ?? null).length;
  } catch {
    return { ok: false };
  }
  if (size > MAX_EVENT_BYTES) return { ok: false };

  const parsed = validateSaveLookInput({ outfit: raw.outfit, occasion: raw.occasion });
  if (!parsed.ok) return { ok: false };

  let storedReason: string | null = null;
  if (type === "disliked") {
    if (typeof reason !== "string" || !DISLIKE_REASONS.some((r) => r.id === reason)) {
      return { ok: false };
    }
    storedReason = reason;
  }

  const refs = await ownedRefs(userId, { styleId: raw.styleId, generationId: raw.generationId, lookId: raw.lookId });

  await db.insert(outfitEvents).values({
    userId,
    type: type as OutfitEventType,
    outfit: parsed.value.outfit,
    reason: storedReason,
    styleId: refs.styleId,
    occasion: parsed.value.occasion ?? null,
    generationId: refs.generationId,
    lookId: refs.lookId,
  });

  // Phase 3 (taste memory): learn from this event after the response is sent.
  after(() => refreshTasteAfterEvent(userId, refs.styleId));

  return { ok: true };
}
