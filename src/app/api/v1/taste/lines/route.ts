import { data, invalid, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { readScope } from "@/lib/api/taste";
import { addTasteLineForUser } from "@/server/taste-core";

/**
 * POST /api/v1/taste/lines — `{ styleId?, text, kind: "like" | "avoid" }`.
 * A line in the person's own words (3 to 120 characters); a refresh never
 * replaces it. Answers with the scope's `TasteProfile` (201).
 */
export const POST = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  if (typeof body.value !== "object" || body.value === null || Array.isArray(body.value)) {
    return invalid(["Expected { styleId?, text, kind }"]);
  }
  const input = body.value as { styleId?: unknown; text?: unknown; kind?: unknown };

  const scope = readScope(input.styleId);
  if (!scope.ok) return invalid(["styleId is not a valid id"]);
  if (input.kind !== "like" && input.kind !== "avoid") return invalid(['kind must be "like" or "avoid"']);
  if (typeof input.text !== "string") return invalid(["text is required"]);

  const result = await addTasteLineForUser(user.id, { styleId: scope.styleId, text: input.text, kind: input.kind });
  return result.ok ? data(result.profile, 201) : invalid(result.errors);
});
