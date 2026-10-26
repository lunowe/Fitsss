import { data, invalid, notFound, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { archiveLookForUser, renameLookForUser } from "@/server/looks-core";
import { getLookForUser } from "@/server/looks-queries";

type Ctx = RouteContext<"/api/v1/looks/[id]">;

const isGone = (errors: string[]) => errors.includes("Look not found");

/** GET /api/v1/looks/:id */
export const GET = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const look = await getLookForUser(user.id, id);
  return look ? data(look) : notFound("No such look");
});

/** PATCH /api/v1/looks/:id — `{ name }`; renaming is the only edit. */
export const PATCH = withUser<Ctx>(async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const name = typeof body.value === "object" && body.value !== null ? (body.value as { name?: unknown }).name : undefined;
  const result = await renameLookForUser(user.id, id, name);
  if (result.ok) return data(result.look);
  return isGone(result.errors) ? notFound("No such look") : invalid(result.errors);
});

/** DELETE /api/v1/looks/:id — removes the look (records an "unsaved" event). */
export const DELETE = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const result = await archiveLookForUser(user.id, id);
  if (!result.ok) return notFound("No such look");
  return new Response(null, { status: 204 });
});
