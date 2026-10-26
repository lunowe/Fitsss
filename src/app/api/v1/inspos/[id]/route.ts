import { data, invalid, notFound, readJson } from "@/lib/api/respond";
import { apiInspo, inspoFailure } from "@/lib/api/inspo";
import { withUser } from "@/lib/api/route";
import { deleteInspoForUser, setInspoNoteForUser, setInspoStyleForUser } from "@/server/inspo-core";
import { getInspoForUser } from "@/server/inspo-queries";

type Ctx = RouteContext<"/api/v1/inspos/[id]">;

const GONE = "That picture is gone.";

/** GET /api/v1/inspos/:id */
export const GET = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const inspo = await getInspoForUser(user.id, id);
  return inspo ? data(apiInspo(inspo)) : notFound(GONE);
});

/**
 * PATCH /api/v1/inspos/:id — `{ styleId?, note? }`, either or both.
 * `styleId` files the picture as a reference for one of the user's styles
 * (null unfiles it); `note` replaces the note (empty clears it). Answers
 * with the `Inspo`.
 */
export const PATCH = withUser<Ctx>(async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  if (typeof body.value !== "object" || body.value === null || Array.isArray(body.value)) {
    return invalid(["Expected { styleId?, note? }"]);
  }
  const input = body.value as { styleId?: unknown; note?: unknown };

  const errors: string[] = [];
  if ("styleId" in input && input.styleId !== null && typeof input.styleId !== "string") {
    errors.push("styleId must be a style id or null");
  }
  if ("note" in input && input.note !== null && typeof input.note !== "string") {
    errors.push("note must be text");
  }
  if (errors.length) return invalid(errors);

  if ("styleId" in input) {
    const styleId = typeof input.styleId === "string" ? input.styleId.trim().toLowerCase() : null;
    const result = await setInspoStyleForUser(user.id, { id, styleId });
    if (!result.ok) return inspoFailure(result);
  }
  if ("note" in input) {
    const result = await setInspoNoteForUser(user.id, { id, note: typeof input.note === "string" ? input.note : "" });
    if (!result.ok) return inspoFailure(result);
  }

  const inspo = await getInspoForUser(user.id, id);
  return inspo ? data(apiInspo(inspo)) : notFound(GONE);
});

/** DELETE /api/v1/inspos/:id — the picture and its analysis. Looks saved from it stay. */
export const DELETE = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const result = await deleteInspoForUser(user.id, id);
  if (!result.ok) return notFound(GONE);
  return new Response(null, { status: 204 });
});
