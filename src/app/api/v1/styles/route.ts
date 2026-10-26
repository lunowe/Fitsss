import { data, invalid, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { createStyleForUser } from "@/server/styles-core";
import { listStylesForUser } from "@/server/styles-queries";

/** GET /api/v1/styles — active styles in the user's order. */
export const GET = withUser(async (_request, user) => {
  return data(await listStylesForUser(user.id));
});

/** POST /api/v1/styles — `{ name, description, rules? }`. At most six active styles. */
export const POST = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const result = await createStyleForUser(user.id, body.value);
  return result.ok ? data(result.style, 201) : invalid(result.errors);
});
