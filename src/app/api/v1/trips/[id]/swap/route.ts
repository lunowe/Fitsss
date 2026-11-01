import { data, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { tripFailure } from "@/lib/api/trips";
import { swapTripPieceForUser } from "@/server/trips-core";

type Ctx = RouteContext<"/api/v1/trips/[id]/swap">;

/**
 * POST /api/v1/trips/:id/swap — `{ date, slot, toBlockId, fromBlockId? }`.
 * Puts another of the person's pieces in one slot of one day (accessories:
 * replaces `fromBlockId`, or adds). The suitcase follows. Answers with the `Trip`.
 */
export const POST = withUser<Ctx>(async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const result = await swapTripPieceForUser(user.id, id, body.value);
  return result.ok ? data(result.trip) : tripFailure(result);
});
