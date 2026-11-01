import { data, notFound, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { tripFailure } from "@/lib/api/trips";
import { deleteTripForUser, getTripForUser, updateTripForUser } from "@/server/trips-core";

type Ctx = RouteContext<"/api/v1/trips/[id]">;

const GONE = "That trip is gone.";

/** GET /api/v1/trips/:id */
export const GET = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const trip = await getTripForUser(user.id, id);
  return trip ? data(trip) : notFound(GONE);
});

/**
 * PATCH /api/v1/trips/:id — any of `name`, `activities`, `luggage`, `laundry`,
 * `styleId`, `steer` (kept for the next packing), `packed: { [blockId]: bool }`,
 * `counts: { [blockId]: n }` (0 takes a spare out; never below what the days
 * wear or above what is owned). Answers with the `Trip`.
 */
export const PATCH = withUser<Ctx>(async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const result = await updateTripForUser(user.id, id, body.value);
  return result.ok ? data(result.trip) : tripFailure(result);
});

/** DELETE /api/v1/trips/:id — 204; a trip already gone answers 404. */
export const DELETE = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  return (await deleteTripForUser(user.id, id)) ? new Response(null, { status: 204 }) : notFound(GONE);
});
