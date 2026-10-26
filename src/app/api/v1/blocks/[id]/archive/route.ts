import { data, notFound } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { archiveBlockForUser, restoreBlockForUser, revalidateCloset } from "@/server/blocks-core";
import { getBlockForUser } from "@/server/blocks-queries";

type Ctx = RouteContext<"/api/v1/blocks/[id]/archive">;

/**
 * Archiving is a sub-resource rather than a field on PATCH, because PATCH
 * takes a whole BlockInput and archiving is not part of one.
 */

/** POST /api/v1/blocks/:id/archive */
export const POST = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  if (!(await archiveBlockForUser(user.id, id)).ok) return notFound("No such piece");

  revalidateCloset();
  return data(await getBlockForUser(user.id, id));
});

/** DELETE /api/v1/blocks/:id/archive — put it back in the closet. */
export const DELETE = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  if (!(await restoreBlockForUser(user.id, id)).ok) return notFound("No such piece");

  revalidateCloset();
  return data(await getBlockForUser(user.id, id));
});
