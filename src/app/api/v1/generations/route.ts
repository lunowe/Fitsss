import { data, failure, invalid, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { validateGenerationRequest } from "@/lib/llm/generation-request";
import { generateOutfitsForUser, type GenerateErrorCode } from "@/server/generate-core";

/** How each generation failure reads over HTTP. */
const FAILURES: Record<Exclude<GenerateErrorCode, "invalid">, { status: number; code: Parameters<typeof failure>[1] }> = {
  "empty-closet": { status: 409, code: "empty_closet" },
  "too-few-pieces": { status: 409, code: "too_few_pieces" },
  "not-configured": { status: 503, code: "not_configured" },
  llm: { status: 502, code: "generation_failed" },
};

/**
 * POST /api/v1/generations — a `GenerationRequest`; answers with the
 * `GenerationResult` (201). Takes as long as the model does (tens of
 * seconds), so clients need a long timeout. A request the closet can't
 * support is a 409 (`empty_closet`, `too_few_pieces`); a model failure is a
 * 502 worth retrying.
 */
export const POST = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const parsed = validateGenerationRequest(body.value);
  if (!parsed.ok) return invalid(parsed.errors);

  const result = await generateOutfitsForUser(user.id, parsed.request);
  if (result.ok) return data(result.result, 201);
  if (result.code === "invalid") return invalid([result.error]);

  const { status, code } = FAILURES[result.code];
  return failure(status, code, result.error);
});
