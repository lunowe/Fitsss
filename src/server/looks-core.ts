import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { blocks, looks, outfitEvents } from "@/db/schema";
import { outfitBlockIds, type Outfit } from "@/domain";
import { ownedRefs } from "@/server/owned-refs";
import { refreshTasteAfterEvent } from "@/server/taste-core";
import { rowToLook, type Look } from "@/server/looks-queries";
import { unknownBlockIds, validateLookName, validateSaveLookInput } from "@/server/looks-validate";

export type LookResult = { ok: true; look: Look } | { ok: false; errors: string[] };
export type LookActionResult = { ok: true } | { ok: false; errors: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOT_FOUND = ["Look not found"];

/**
 * The looks' writes, taking the user explicitly, shared by the server actions
 * in `looks.ts` and the `/api/v1/looks` handlers. Cache invalidation belongs
 * to the caller; the taste refresh runs here, after the response, for both.
 */

/** The snapshot stored on every outfit event, so phase 3 can learn from it. */
function snapshotOf(look: Look): Outfit {
  return {
    id: look.id,
    name: look.name,
    slots: look.slots,
    why: look.why,
    tip: look.tip ?? undefined,
  };
}

/**
 * Saves a generated outfit as a look and records a "saved" feedback event.
 * Every block id in the slots must belong to the signed-in user.
 */
export async function saveLookForUser(userId: string, input: unknown): Promise<LookResult> {
  const parsed = validateSaveLookInput(input);
  if (!parsed.ok) return parsed;

  const { outfit, occasion, weather } = parsed.value;
  // The style and generation it came from, only when they are the user's own.
  const { styleId, generationId } = await ownedRefs(userId, parsed.value);
  const ids = outfitBlockIds(outfit.slots);

  // A repeat of a save that already went through returns that look, even if
  // one of its pieces was archived since (the checks below would refuse it).
  if (generationId) {
    const [existing] = await sameLook(userId, generationId, outfit.slots);
    if (existing) return { ok: true, look: rowToLook(existing) };
  }

  const owned = await db
    .select({ id: blocks.id })
    .from(blocks)
    // Active pieces only: an archived one can't go into a new look.
    .where(and(eq(blocks.userId, userId), inArray(blocks.id, ids), isNull(blocks.archivedAt)));

  const missing = unknownBlockIds(
    outfit.slots,
    owned.map((row) => row.id),
  );
  if (missing.length) return { ok: false, errors: ["That outfit uses pieces that are not in your closet"] };

  const result = await db.transaction(async (tx) => {
    // Saving the same outfit of the same generation again (a retry whose
    // first answer was lost, a double tap, a second device) returns the look
    // already saved instead of a copy and a second taste signal. The lock
    // makes two concurrent first saves take turns.
    if (generationId) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`look:${userId}:${generationId}`}))`);
      const [existing] = await sameLook(userId, generationId, outfit.slots, tx);
      if (existing) return { look: rowToLook(existing), created: false };
    }

    const [row] = await tx
      .insert(looks)
      .values({
        userId: userId,
        name: outfit.name,
        slots: outfit.slots,
        why: outfit.why,
        tip: outfit.tip,
        styleId,
        occasion,
        weather,
        generationId,
      })
      .returning();

    const saved = rowToLook(row);
    await tx.insert(outfitEvents).values({
      userId: userId,
      type: "saved",
      outfit: snapshotOf(saved),
      styleId,
      occasion,
      generationId,
      lookId: saved.id,
    });
    return { look: saved, created: true };
  });

  // Phase 3 (taste memory): learn from the "saved" event after the response is sent.
  if (result.created) after(() => refreshTasteAfterEvent(userId, result.look.styleId));

  return { ok: true, look: result.look };
}

export async function renameLookForUser(userId: string, id: string, name: unknown): Promise<LookResult> {
  const parsed = validateLookName(name);
  if (!parsed.ok) return parsed;
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .update(looks)
    .set({ name: parsed.value, updatedAt: new Date() })
    .where(and(eq(looks.id, id), eq(looks.userId, userId), isNull(looks.archivedAt)))
    .returning();

  if (!row) return { ok: false, errors: NOT_FOUND };

  return { ok: true, look: rowToLook(row) };
}

/** Removes a look from the grid and records an "unsaved" event. */
export async function archiveLookForUser(userId: string, id: string): Promise<LookActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const removed = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(looks)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(looks.id, id), eq(looks.userId, userId), isNull(looks.archivedAt)))
      .returning();
    if (!row) return null;

    const look = rowToLook(row);
    await tx.insert(outfitEvents).values({
      userId: userId,
      type: "unsaved",
      outfit: snapshotOf(look),
      styleId: look.styleId,
      occasion: look.occasion,
      generationId: look.generationId,
      lookId: look.id,
    });
    return look;
  });

  if (!removed) return { ok: false, errors: NOT_FOUND };

  // Phase 3 (taste memory): learn from the "unsaved" event after the response is sent.
  after(() => refreshTasteAfterEvent(userId, removed.styleId));

  return { ok: true };
}

/** A wear within this long of the last one is the same wear (a retry, a double tap). */
const SAME_WEAR_MS = 6 * 60 * 60 * 1000;

/**
 * Marks a look as worn today: bumps the count and records a "worn" event.
 * The row is locked for the read and the increment, so concurrent wears
 * can't both read the old count; a second wear within six hours of the last
 * one returns the look unchanged.
 */
export async function markWornForUser(userId: string, id: string): Promise<LookResult> {
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(looks)
      .where(and(eq(looks.id, id), eq(looks.userId, userId), isNull(looks.archivedAt)))
      .for("update")
      .limit(1);
    if (!current) return null;
    if (current.lastWornAt && now.getTime() - current.lastWornAt.getTime() < SAME_WEAR_MS) {
      return { look: rowToLook(current), counted: false };
    }

    const [row] = await tx
      .update(looks)
      .set({ wornCount: sql`${looks.wornCount} + 1`, lastWornAt: now, updatedAt: now })
      .where(eq(looks.id, current.id))
      .returning();

    const look = rowToLook(row);
    await tx.insert(outfitEvents).values({
      userId: userId,
      type: "worn",
      outfit: snapshotOf(look),
      styleId: look.styleId,
      occasion: look.occasion,
      generationId: look.generationId,
      lookId: look.id,
    });
    return { look, counted: true };
  });

  if (!result) return { ok: false, errors: NOT_FOUND };

  // Phase 3 (taste memory): learn from the "worn" event after the response is sent.
  if (result.counted) after(() => refreshTasteAfterEvent(userId, result.look.styleId));

  return { ok: true, look: result.look };
}

/** An active look of this generation with exactly these slots. */
function sameLook(
  userId: string,
  generationId: string,
  slots: Outfit["slots"],
  client: Pick<typeof db, "select"> = db,
) {
  return client
    .select()
    .from(looks)
    .where(
      and(
        eq(looks.userId, userId),
        eq(looks.generationId, generationId),
        isNull(looks.archivedAt),
        sql`${looks.slots} = ${JSON.stringify(slots)}::jsonb`,
      ),
    )
    .limit(1);
}
