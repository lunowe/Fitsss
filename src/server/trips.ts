"use server";

import { revalidatePath } from "next/cache";
import type { TripPlace } from "@/domain";
import { requireUser } from "@/lib/session";
import { searchPlaces } from "@/server/places";
import {
  createTripForUser,
  deleteTripForUser,
  swapTripPieceForUser,
  updateTripForUser,
  type TripResult,
} from "@/server/trips-core";

/**
 * The trips' writes as server actions. The work lives in `trips-core.ts`,
 * which the `/api/v1/trips` handlers share; these add the session and the
 * cache invalidation the web app needs.
 *
 * Packing is not here. It takes up to a minute and a half, and Next.js runs a
 * client's server actions one at a time: a packing action would hold every
 * tick, search and Today's "Style me" behind it. The page packs through
 * `POST /api/v1/trips/:id/plan` instead (the same core function, the cookie
 * session), which runs alongside.
 */

function revalidateTrip(id?: string) {
  revalidatePath("/looks");
  if (id) revalidatePath(`/trips/${id}`);
}

/** Stores the trip with its weather, not yet packed. */
export async function createTrip(input: unknown): Promise<TripResult> {
  const currentUser = await requireUser();
  const result = await createTripForUser(currentUser.id, input);
  if (result.ok) revalidateTrip();
  return result;
}

/**
 * Name, activities, bag, laundry, style or note; `packed: { [blockId]: bool }`
 * ticks; `counts: { [blockId]: n }`.
 */
export async function updateTrip(id: string, patch: unknown): Promise<TripResult> {
  const currentUser = await requireUser();
  const result = await updateTripForUser(currentUser.id, id, patch);
  if (result.ok) revalidateTrip(result.trip.id);
  return result;
}

/** `{ date, slot, toBlockId, fromBlockId? }`, or `slot: "separates"` with `top` and `bottom`. */
export async function swapTripPiece(id: string, input: unknown): Promise<TripResult> {
  const currentUser = await requireUser();
  const result = await swapTripPieceForUser(currentUser.id, id, input);
  if (result.ok) revalidateTrip(result.trip.id);
  return result;
}

export async function deleteTrip(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentUser = await requireUser();
  const deleted = await deleteTripForUser(currentUser.id, id);
  if (!deleted) return { ok: false, error: "That trip is gone." };
  revalidateTrip();
  return { ok: true };
}

/** Up to eight places for a name, each with its time zone. */
export async function searchTripPlaces(
  query: string,
): Promise<{ ok: true; places: TripPlace[] } | { ok: false; retryable: boolean; error: string }> {
  await requireUser();
  const result = await searchPlaces(typeof query === "string" ? query : "");
  if (result.ok) return result;
  return { ok: false, retryable: result.code !== "invalid", error: result.error };
}
