"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { blocks, looks, outfitEvents } from "@/db/schema";
import { outfitBlockIds, type Outfit } from "@/domain";
import { requireUser } from "@/lib/session";
import { refreshTasteAfterEvent } from "@/server/taste-core";
import { rowToLook, type Look } from "@/server/looks-queries";
import { unknownBlockIds, validateLookName, validateSaveLookInput } from "@/server/looks-validate";

export type LookResult = { ok: true; look: Look } | { ok: false; errors: string[] };
export type LookActionResult = { ok: true } | { ok: false; errors: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOT_FOUND = ["Look not found"];

function revalidate() {
  revalidatePath("/looks");
}

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
export async function saveLook(input: unknown): Promise<LookResult> {
  const currentUser = await requireUser();
  const parsed = validateSaveLookInput(input);
  if (!parsed.ok) return parsed;

  const { outfit, styleId, occasion, weather, generationId } = parsed.value;
  const ids = outfitBlockIds(outfit.slots);

  const owned = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.userId, currentUser.id), inArray(blocks.id, ids)));

  const missing = unknownBlockIds(
    outfit.slots,
    owned.map((row) => row.id),
  );
  if (missing.length) return { ok: false, errors: ["That outfit uses pieces that are not in your closet"] };

  const look = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(looks)
      .values({
        userId: currentUser.id,
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
      userId: currentUser.id,
      type: "saved",
      outfit: snapshotOf(saved),
      styleId,
      occasion,
      generationId,
      lookId: saved.id,
    });
    return saved;
  });

  // Phase 3 (taste memory): learn from the "saved" event after the response is sent.
  after(() => refreshTasteAfterEvent(currentUser.id, look.styleId));

  revalidate();
  return { ok: true, look };
}

export async function renameLook(id: string, name: unknown): Promise<LookResult> {
  const currentUser = await requireUser();
  const parsed = validateLookName(name);
  if (!parsed.ok) return parsed;
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .update(looks)
    .set({ name: parsed.value, updatedAt: new Date() })
    .where(and(eq(looks.id, id), eq(looks.userId, currentUser.id), isNull(looks.archivedAt)))
    .returning();

  if (!row) return { ok: false, errors: NOT_FOUND };

  revalidate();
  revalidatePath(`/looks/${id}`);
  return { ok: true, look: rowToLook(row) };
}

/** Removes a look from the grid and records an "unsaved" event. */
export async function archiveLook(id: string): Promise<LookActionResult> {
  const currentUser = await requireUser();
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const removed = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(looks)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(looks.id, id), eq(looks.userId, currentUser.id), isNull(looks.archivedAt)))
      .returning();
    if (!row) return null;

    const look = rowToLook(row);
    await tx.insert(outfitEvents).values({
      userId: currentUser.id,
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
  after(() => refreshTasteAfterEvent(currentUser.id, removed.styleId));

  revalidate();
  revalidatePath(`/looks/${id}`);
  return { ok: true };
}

/** Marks a look as worn today: bumps the count and records a "worn" event. */
export async function markWorn(id: string): Promise<LookResult> {
  const currentUser = await requireUser();
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const now = new Date();
  const worn = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(looks)
      .where(and(eq(looks.id, id), eq(looks.userId, currentUser.id), isNull(looks.archivedAt)))
      .limit(1);
    if (!current) return null;

    const [row] = await tx
      .update(looks)
      .set({ wornCount: current.wornCount + 1, lastWornAt: now, updatedAt: now })
      .where(eq(looks.id, current.id))
      .returning();

    const look = rowToLook(row);
    await tx.insert(outfitEvents).values({
      userId: currentUser.id,
      type: "worn",
      outfit: snapshotOf(look),
      styleId: look.styleId,
      occasion: look.occasion,
      generationId: look.generationId,
      lookId: look.id,
    });
    return look;
  });

  if (!worn) return { ok: false, errors: NOT_FOUND };

  // Phase 3 (taste memory): learn from the "worn" event after the response is sent.
  after(() => refreshTasteAfterEvent(currentUser.id, worn.styleId));

  revalidate();
  revalidatePath(`/looks/${id}`);
  return { ok: true, look: worn };
}
