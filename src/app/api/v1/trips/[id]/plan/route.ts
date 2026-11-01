import { data, readOptionalJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { tripFailure } from "@/lib/api/trips";
import { planTripForUser } from "@/server/trips-core";

type Ctx = RouteContext<"/api/v1/trips/[id]/plan">;

/**
 * POST /api/v1/trips/:id/plan — `{ steer? }` (replaces the trip's note).
 * Packs the trip: the suitcase and an outfit a day, from the closet and the
 * weather, never more of a piece than is owned. Slow (a model call, up to
 * two). Packing again replaces the plan; ticks on pieces still packed stay.
 * Answers with the `Trip`. 409 `empty_closet`/`too_few_pieces`, 502
 * `plan_failed`, 503 `not_configured`/`weather_failed`.
 */
export const POST = withUser<Ctx>(async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readOptionalJson(request);
  if (!body.ok) return body.response;
  const result = await planTripForUser(user.id, id, body.value);
  return result.ok ? data(result.trip) : tripFailure(result);
});
