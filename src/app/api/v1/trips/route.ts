import { data, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { tripFailure } from "@/lib/api/trips";
import { createTripForUser, listTripsForUser } from "@/server/trips-core";

/** GET /api/v1/trips — every `Trip`, latest start first. */
export const GET = withUser(async (_request, user) => {
  return data(await listTripsForUser(user.id));
});

/**
 * POST /api/v1/trips — `{ place: TripPlace, startDate, endDate, name?,
 * activities?, luggage?, laundry?, styleId?, steer? }`. Stores the trip with
 * its weather, not yet packed: 201 with the `Trip`. Pack it with
 * `POST /api/v1/trips/:id/plan`. Luggage defaults to a carry-on up to three
 * nights, a checked bag beyond. 503 `weather_failed`, 409 `limit_reached`.
 */
export const POST = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const result = await createTripForUser(user.id, body.value);
  return result.ok ? data(result.trip, 201) : tripFailure(result);
});
