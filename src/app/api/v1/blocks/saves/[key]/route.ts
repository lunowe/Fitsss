import { data, notFound } from "@/lib/api/respond";
import { IDEMPOTENCY_KEY_RE } from "@/lib/api/idempotency";
import { withUser } from "@/lib/api/route";
import { findSaveForUser } from "@/server/blocks-core";

type Ctx = RouteContext<"/api/v1/blocks/saves/[key]">;

/**
 * GET /api/v1/blocks/saves/:key — what the save sent with this
 * `Idempotency-Key` stored (`{ created, failed }`), or 404 when none was
 * committed *yet*. Read-only: a 404 does not prove a request still on its
 * way won't store. To put pieces back safely, use `POST …/abandon`.
 */
export const GET = withUser<Ctx>(async (_request, user, ctx) => {
  const { key } = await ctx.params;
  if (!IDEMPOTENCY_KEY_RE.test(key)) return notFound("No save with that key");
  const result = await findSaveForUser(user.id, key);
  return result ? data(result) : notFound("No save with that key");
});
