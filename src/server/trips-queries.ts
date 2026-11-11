import "server-only";

import { todayIn, type Trip } from "@/domain";
import { requireUser } from "@/lib/session";
import { getTripForUser, isPacking, listTripsForUser } from "@/server/trips-core";

/**
 * Trips as the web pages read them. The work is in `trips-core.ts`; these add
 * the session and the one thing a page needs that the API answers elsewhere:
 * whether the trip is being packed right now.
 */

export interface TripShelfEntry {
  trip: Trip;
  /** Over: its last day has passed where the trip goes. */
  isPast: boolean;
  isPacking: boolean;
}

/** Upcoming trips soonest first, then past ones, latest first. */
export async function listTripsForShelf(): Promise<TripShelfEntry[]> {
  const currentUser = await requireUser();
  const trips = await listTripsForUser(currentUser.id);
  const entries = trips.map((trip) => ({
    trip,
    isPast: trip.endDate < todayIn(trip.place.timezone),
    isPacking: isPacking(currentUser.id, trip.id),
  }));
  const upcoming = entries
    .filter((entry) => !entry.isPast)
    .sort((a, b) => a.trip.startDate.localeCompare(b.trip.startDate) || a.trip.createdAt.localeCompare(b.trip.createdAt));
  const past = entries
    .filter((entry) => entry.isPast)
    .sort((a, b) => b.trip.startDate.localeCompare(a.trip.startDate));
  return [...upcoming, ...past];
}

export async function getTripForPage(id: string): Promise<{ trip: Trip; isPacking: boolean } | null> {
  const currentUser = await requireUser();
  const trip = await getTripForUser(currentUser.id, id);
  return trip ? { trip, isPacking: isPacking(currentUser.id, trip.id) } : null;
}
