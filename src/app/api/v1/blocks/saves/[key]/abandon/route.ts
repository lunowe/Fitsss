import { data, invalid } from "@/lib/api/respond";
import { IDEMPOTENCY_KEY_RE } from "@/lib/api/idempotency";
import { withUser } from "@/lib/api/route";
import { abandonSaveForUser, revalidateCloset } from "@/server/blocks-core";

type Ctx = RouteContext<"/api/v1/blocks/saves/[key]/abandon">;

/**
 * POST /api/v1/blocks/saves/:key/abandon — settles a save whose answer was
 * lost, for good. `{ stored: { created, failed } }` when a save with the key
 * was committed (it may have been waiting on one still running), else
 * `{ stored: null }`, and from then on any send with this key is refused
 * with 409: the client can put the pieces back and save them under a new key
 * without anything being stored twice.
 */
export const POST = withUser<Ctx>(async (_request, user, ctx) => {
  const { key } = await ctx.params;
  if (!IDEMPOTENCY_KEY_RE.test(key)) return invalid(["Idempotency-Key: 8 to 100 letters, digits, - or _"]);
  const stored = await abandonSaveForUser(user.id, key);
  if (stored) revalidateCloset();
  return data({ stored });
});
