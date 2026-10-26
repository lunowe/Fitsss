import { data, invalid } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { readScope } from "@/lib/api/taste";
import { removeTasteLineForUser } from "@/server/taste-core";

type Ctx = RouteContext<"/api/v1/taste/lines/[lineId]">;

/**
 * DELETE /api/v1/taste/lines/:lineId?styleId= — removes a line, learned or
 * written, from that scope (overall without a style). A line already gone
 * counts as removed. Answers with the scope's `TasteProfile`.
 */
export const DELETE = withUser<Ctx>(async (request, user, ctx) => {
  const { lineId } = await ctx.params;
  const scope = readScope(new URL(request.url).searchParams.get("styleId"));
  if (!scope.ok) return invalid(["styleId is not a valid id"]);

  const result = await removeTasteLineForUser(user.id, { styleId: scope.styleId, lineId });
  return result.ok ? data(result.profile) : invalid(result.errors);
});
