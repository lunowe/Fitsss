import { data, notFound } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { markWornForUser } from "@/server/looks-core";

type Ctx = RouteContext<"/api/v1/looks/[id]/wear">;

/** POST /api/v1/looks/:id/wear — worn today: bumps the count, records a "worn" event. */
export const POST = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const result = await markWornForUser(user.id, id);
  return result.ok ? data(result.look) : notFound("No such look");
});
