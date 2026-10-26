import { data } from "@/lib/api/respond";
import { apiInspo, inspoFailure } from "@/lib/api/inspo";
import { withUser } from "@/lib/api/route";
import { analyzeInspoForUser } from "@/server/inspo-core";

type Ctx = RouteContext<"/api/v1/inspos/[id]/analyze">;

/**
 * POST /api/v1/inspos/:id/analyze — reads the picture into pieces and
 * matches them against the closet; answers with the `Inspo`. As slow as the
 * model (tens of seconds). Asking again re-reads it. 502 `analysis_failed`
 * (nothing found, declined, the model failed) is worth a retry; 503 means
 * reading pictures is not set up on the server.
 */
export const POST = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const result = await analyzeInspoForUser(user.id, id);
  return result.ok ? data(apiInspo(result.inspo)) : inspoFailure(result);
});
