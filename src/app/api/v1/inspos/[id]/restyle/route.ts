import { data, failure, invalid, notFound, readOptionalJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { restyleFromInspoForUser, type GenerateErrorCode } from "@/server/generate-core";
import { getInspoForUser } from "@/server/inspo-queries";

type Ctx = RouteContext<"/api/v1/inspos/[id]/restyle">;

const FAILURES: Record<Exclude<GenerateErrorCode, "invalid">, { status: number; code: Parameters<typeof failure>[1] }> = {
  "empty-closet": { status: 409, code: "empty_closet" },
  "too-few-pieces": { status: 409, code: "too_few_pieces" },
  "not-configured": { status: 503, code: "not_configured" },
  llm: { status: 502, code: "generation_failed" },
};

/**
 * POST /api/v1/inspos/:id/restyle — `{ count?, occasion?, weather? }` (all
 * optional; two outfits for an everyday, mild grey day by default). Outfits
 * from the closet in the spirit of the picture, as a `GenerationResult`
 * (201). Like `POST /api/v1/generations`: slow, same errors. The picture has
 * to be analysed first (422 otherwise). These outfits are not Today's:
 * `generations/latest` skips them.
 */
export const POST = withUser<Ctx>(async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readOptionalJson(request);
  if (!body.ok) return body.response;
  if (typeof body.value !== "object" || body.value === null || Array.isArray(body.value)) {
    return invalid(["Expected { count?, occasion?, weather? }"]);
  }

  const inspo = await getInspoForUser(user.id, id);
  if (!inspo) return notFound("That picture is gone.");

  const result = await restyleFromInspoForUser(user.id, { ...body.value, inspoId: inspo.id });
  if (result.ok) return data(result.result, 201);
  if (result.code === "invalid") return invalid([result.error]);
  const { status, code } = FAILURES[result.code];
  return failure(status, code, result.error);
});
