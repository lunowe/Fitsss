"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import {
  archiveStyleForUser,
  createStyleForUser,
  reorderStylesForUser,
  updateStyleForUser,
  type StyleActionResult,
  type StyleResult,
} from "@/server/styles-core";

/**
 * The styles' writes as server actions. The work lives in `styles-core.ts`,
 * which the `/api/v1` handlers share; these add the session and the cache
 * invalidation the web app needs.
 */

export async function createStyle(input: unknown): Promise<StyleResult> {
  const currentUser = await requireUser();
  return revalidatedIfOk(await createStyleForUser(currentUser.id, input));
}

export async function updateStyle(id: string, input: unknown): Promise<StyleResult> {
  const currentUser = await requireUser();
  return revalidatedIfOk(await updateStyleForUser(currentUser.id, id, input));
}

export async function archiveStyle(id: string): Promise<StyleActionResult> {
  const currentUser = await requireUser();
  return revalidatedIfOk(await archiveStyleForUser(currentUser.id, id));
}

/**
 * Rewrites `sortOrder` from the given order. Ids the user does not own are
 * ignored; styles the caller left out keep their relative order after the rest.
 */
export async function reorderStyles(ids: string[]): Promise<StyleActionResult> {
  const currentUser = await requireUser();
  return revalidatedIfOk(await reorderStylesForUser(currentUser.id, ids));
}

function revalidatedIfOk<T extends { ok: boolean }>(result: T): T {
  if (result.ok) {
    revalidatePath("/styles");
    revalidatePath("/today");
  }
  return result;
}
