import { data, invalid, notFound, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { archiveStyleForUser, updateStyleForUser } from "@/server/styles-core";
import { getStyleForUser } from "@/server/styles-queries";

type Ctx = RouteContext<"/api/v1/styles/[id]">;

const isGone = (errors: string[]) => errors.includes("Style not found");

/** GET /api/v1/styles/:id */
export const GET = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const style = await getStyleForUser(user.id, id);
  return style ? data(style) : notFound("No such style");
});

/** PATCH /api/v1/styles/:id — a whole `{ name, description, rules? }`, as on create. */
export const PATCH = withUser<Ctx>(async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const result = await updateStyleForUser(user.id, id, body.value);
  if (result.ok) return data(result.style);
  return isGone(result.errors) ? notFound("No such style") : invalid(result.errors);
});

/** DELETE /api/v1/styles/:id */
export const DELETE = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const result = await archiveStyleForUser(user.id, id);
  if (!result.ok) return notFound("No such style");
  return new Response(null, { status: 204 });
});
