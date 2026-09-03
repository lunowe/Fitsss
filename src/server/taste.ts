"use server";

import { revalidatePath } from "next/cache";
import type { TasteProfile } from "@/lib/taste";
import { requireUser } from "@/lib/session";
import {
  addTasteLineForUser,
  refreshTasteNotesForUser,
  removeTasteLineForUser,
  type TasteRefreshErrorCode,
} from "@/server/taste-core";

/**
 * Write side of taste memory: re-read the feedback into notes, and let the
 * person add or remove a note in their own words.
 */

export type RefreshTasteResult =
  | { ok: true; profile: TasteProfile }
  | { ok: false; error: string; code: TasteRefreshErrorCode };

export type TasteLineResult = { ok: true; profile: TasteProfile } | { ok: false; errors: string[] };

function revalidate() {
  revalidatePath("/you");
  revalidatePath("/today");
}

/** Re-reads every event in scope and rewrites the learned lines. */
export async function refreshTasteNotes(input: { styleId: string | null }): Promise<RefreshTasteResult> {
  const currentUser = await requireUser();
  const result = await refreshTasteNotesForUser(currentUser.id, input?.styleId ?? null);
  if (result.ok) revalidate();
  return result;
}

/** Adds a line the person wrote themselves. Never overwritten by a refresh. */
export async function addTasteLine(input: {
  styleId: string | null;
  text: string;
  kind: "like" | "avoid";
}): Promise<TasteLineResult> {
  const currentUser = await requireUser();
  const result = await addTasteLineForUser(currentUser.id, {
    styleId: input?.styleId ?? null,
    text: input?.text,
    kind: input?.kind,
  });
  if (result.ok) revalidate();
  return result;
}

/** Removes a line from either list, learned or user-stated. */
export async function removeTasteLine(input: {
  styleId: string | null;
  lineId: string;
}): Promise<TasteLineResult> {
  const currentUser = await requireUser();
  const result = await removeTasteLineForUser(currentUser.id, {
    styleId: input?.styleId ?? null,
    lineId: input?.lineId,
  });
  if (result.ok) revalidate();
  return result;
}
