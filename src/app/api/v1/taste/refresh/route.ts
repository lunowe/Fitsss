import { data, failure, invalid, notFound, readOptionalJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { readScope } from "@/lib/api/taste";
import { refreshTasteNotesForUser } from "@/server/taste-core";

/**
 * POST /api/v1/taste/refresh — `{ styleId? }`. Re-reads the feedback in that
 * scope (overall without a style) into learned lines; lines the person wrote
 * stay. Answers with the `TasteProfile`. Slow (a model call). 409
 * `too_few_events` until there are three choices to learn from.
 */
export const POST = withUser(async (request, user) => {
  const body = await readOptionalJson(request);
  if (!body.ok) return body.response;
  const scope = readScope((body.value as { styleId?: unknown } | null)?.styleId);
  if (!scope.ok) return invalid(["styleId is not a valid id"]);

  const result = await refreshTasteNotesForUser(user.id, scope.styleId);
  if (result.ok) return data(result.profile);
  switch (result.code) {
    case "not-found":
      return notFound(result.error);
    case "too-few-events":
      return failure(409, "too_few_events", result.error);
    case "not-configured":
      return failure(503, "not_configured", result.error);
    case "llm":
      return failure(502, "refresh_failed", result.error);
  }
});
