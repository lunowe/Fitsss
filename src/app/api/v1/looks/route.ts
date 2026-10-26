import { data, invalid, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { saveLookForUser } from "@/server/looks-core";
import { listLooksForUser } from "@/server/looks-queries";

/** GET /api/v1/looks — saved looks, newest first. */
export const GET = withUser(async (_request, user) => {
  return data(await listLooksForUser(user.id));
});

/**
 * POST /api/v1/looks — `{ outfit, styleId?, occasion?, weather?, generationId? }`.
 * Saves an outfit as a look (every piece must be the user's own) and records
 * a "saved" event for taste learning. Answers with the `Look` (201).
 */
export const POST = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const result = await saveLookForUser(user.id, body.value);
  return result.ok ? data(result.look, 201) : invalid(result.errors);
});
