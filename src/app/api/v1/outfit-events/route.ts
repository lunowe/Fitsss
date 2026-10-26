import { failure, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { recordOutfitEventForUser, type RecordOutfitEventInput } from "@/server/feedback-core";

/**
 * POST /api/v1/outfit-events — `{ type, outfit, reason?, styleId?, occasion?,
 * generationId?, lookId? }`. Feedback for taste learning: `liked` or
 * `disliked` (with a `reason` from the catalog's `dislikeReasons`). 204 when
 * recorded.
 */
export const POST = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  // Saved, worn, swapped and unsaved are recorded by the server itself, by
  // the routes that do those things; a client may only add likes and dislikes.
  const type = (body.value as { type?: unknown } | null)?.type;
  if (type !== "liked" && type !== "disliked") {
    return failure(422, "invalid_input", "Only liked and disliked can be sent; the rest is recorded by the server.");
  }

  const result = await recordOutfitEventForUser(user.id, body.value as RecordOutfitEventInput);
  if (!result.ok) return failure(422, "invalid_input", "That feedback could not be recorded.");
  return new Response(null, { status: 204 });
});
