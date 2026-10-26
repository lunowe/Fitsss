import { data, invalid, notFound, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { deleteBlockForUser, revalidateCloset, updateBlockForUser } from "@/server/blocks-core";
import { getBlockForUser } from "@/server/blocks-queries";

type Ctx = RouteContext<"/api/v1/blocks/[id]">;

/** GET /api/v1/blocks/:id */
export const GET = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const block = await getBlockForUser(user.id, id);
  return block ? data(block) : notFound("No such piece");
});

/** PATCH /api/v1/blocks/:id — a whole BlockInput, same shape as create. */
export const PATCH = withUser<Ctx>(async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const result = await updateBlockForUser(user.id, id, body.value);
  if (!result.ok) {
    // The core returns the same shape for "gone" and "not valid"; only the
    // former is a 404.
    return result.errors.includes("Block not found")
      ? notFound("No such piece")
      : invalid(result.errors);
  }

  revalidateCloset();
  return data(result.block);
});

/** DELETE /api/v1/blocks/:id */
export const DELETE = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const result = await deleteBlockForUser(user.id, id);
  if (!result.ok) return notFound("No such piece");

  revalidateCloset();
  return new Response(null, { status: 204 });
});
