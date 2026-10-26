import { data } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { applyCatalogExtension } from "@/domain";
import { buildCatalogPayload } from "@/server/catalog-payload";
import { loadCatalogExtension } from "@/server/catalog-queries";

/**
 * GET /api/v1/catalog
 *
 * The vocabulary and artwork every other endpoint speaks in. It is large
 * (mostly drawings) and rarely changes, so it is revalidated by ETag: a client
 * that sends back `If-None-Match` gets a bodiless 304 until the user edits
 * their catalog.
 */
export const GET = withUser(async (request, user) => {
  // The catalog registry is process-global: apply this user's extension and
  // read it back in one synchronous stretch, so a concurrent request for
  // another user cannot swap its own in between.
  const extension = await loadCatalogExtension(user.id);
  applyCatalogExtension(extension);
  const payload = buildCatalogPayload();
  const etag = `"${payload.version}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const response = data(payload);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
});
