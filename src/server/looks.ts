"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import {
  archiveLookForUser,
  markWornForUser,
  renameLookForUser,
  saveLookForUser,
  type LookActionResult,
  type LookResult,
} from "@/server/looks-core";

/**
 * The looks' writes as server actions. The work lives in `looks-core.ts`,
 * which the `/api/v1` handlers share; these add the session and the cache
 * invalidation the web app needs.
 */

export async function saveLook(input: unknown): Promise<LookResult> {
  const currentUser = await requireUser();
  const result = await saveLookForUser(currentUser.id, input);
  if (result.ok) revalidatePath("/looks");
  return result;
}

export async function renameLook(id: string, name: unknown): Promise<LookResult> {
  const currentUser = await requireUser();
  const result = await renameLookForUser(currentUser.id, id, name);
  if (result.ok) revalidateLook(id);
  return result;
}

/** Removes a look from the grid and records an "unsaved" event. */
export async function archiveLook(id: string): Promise<LookActionResult> {
  const currentUser = await requireUser();
  const result = await archiveLookForUser(currentUser.id, id);
  if (result.ok) revalidateLook(id);
  return result;
}

/** Marks a look as worn today: bumps the count and records a "worn" event. */
export async function markWorn(id: string): Promise<LookResult> {
  const currentUser = await requireUser();
  const result = await markWornForUser(currentUser.id, id);
  if (result.ok) revalidateLook(id);
  return result;
}

function revalidateLook(id: string) {
  revalidatePath("/looks");
  revalidatePath(`/looks/${id}`);
}
