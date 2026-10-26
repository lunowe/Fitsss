import { data, invalid, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { reorderStylesForUser } from "@/server/styles-core";
import { listStylesForUser } from "@/server/styles-queries";

/**
 * PUT /api/v1/styles/order — `{ ids }` in the new order. Ids the user does not
 * own are ignored; styles left out keep their relative order after the rest.
 * Answers with the styles in their new order.
 */
export const PUT = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const ids = typeof body.value === "object" && body.value !== null ? (body.value as { ids?: unknown }).ids : undefined;
  const result = await reorderStylesForUser(user.id, ids);
  if (!result.ok) return invalid(result.errors);
  return data(await listStylesForUser(user.id));
});
