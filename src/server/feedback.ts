"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { outfitEvents } from "@/db/schema";
import {
  DISLIKE_REASONS,
  OUTFIT_EVENT_TYPES,
  isOccasionId,
  type Outfit,
  type OutfitEventType,
} from "@/domain";
import { isUuid } from "@/lib/llm/generation-request";
import { requireUser } from "@/lib/session";
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

function isOutfit(value: unknown): value is Outfit {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Partial<Outfit>;
  return typeof o.id === "string" && typeof o.slots === "object" && o.slots !== null;
}

export async function recordOutfitEvent(input: RecordOutfitEventInput): Promise<{ ok: boolean }> {
  const currentUser = await requireUser();
  const { type, outfit, reason, styleId, occasion, generationId, lookId } = input ?? {};

  if (typeof type !== "string" || !(OUTFIT_EVENT_TYPES as readonly string[]).includes(type)) {
    return { ok: false };
  }
  if (!isOutfit(outfit)) return { ok: false };

  let storedReason: string | null = null;
  if (type === "disliked") {
    if (typeof reason !== "string" || !DISLIKE_REASONS.some((r) => r.id === reason)) {
      return { ok: false };
    }
    storedReason = reason;
  }

  const scope = isUuid(styleId) ? styleId : null;

  await db.insert(outfitEvents).values({
    userId: currentUser.id,
    type,
    outfit,
    reason: storedReason,
    styleId: scope,
    occasion: typeof occasion === "string" && isOccasionId(occasion) ? occasion : null,
    generationId: isUuid(generationId) ? generationId : null,
    lookId: isUuid(lookId) ? lookId : null,
  });

  // Phase 3 (taste memory): learn from this event after the response is sent.
  after(() => refreshTasteAfterEvent(currentUser.id, scope));

  revalidatePath("/today");
  return { ok: true };
}
