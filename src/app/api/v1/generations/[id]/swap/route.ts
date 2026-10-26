import { data, failure, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { swapSlotForUser } from "@/server/generate-core";

type Ctx = RouteContext<"/api/v1/generations/[id]/swap">;

/**
 * POST /api/v1/generations/:id/swap — `{ outfitId, slot, toBlockId, fromBlockId? }`.
 * Replaces one piece of one outfit in that generation and answers with the
 * updated `Outfit`. `slot` is an outfit slot id or `accessories` (then
 * `fromBlockId` names the accessory being replaced).
 */
export const POST = withUser<Ctx>(async (request, user, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const input = (typeof body.value === "object" && body.value !== null ? body.value : {}) as Record<string, unknown>;
  const result = await swapSlotForUser(user.id, {
    generationId: id,
    outfitId: String(input.outfitId ?? ""),
    slot: String(input.slot ?? "") as never,
    toBlockId: String(input.toBlockId ?? ""),
    fromBlockId: typeof input.fromBlockId === "string" ? input.fromBlockId : undefined,
  });

  return result.ok ? data(result.outfit) : failure(422, "invalid_input", result.error, [result.error]);
});
