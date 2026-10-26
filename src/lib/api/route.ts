import "server-only";

import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/api/respond";
import { applyUserCatalogFor } from "@/server/catalog-queries";

/**
 * The guard every `/api/v1` handler wraps itself in.
 *
 * Two things the page-side `requireUser` cannot do here: it redirects to
 * /login, which is useless to a native client, and it does not put the user's
 * catalog extension in place — which validation and `derive()` both read. This
 * does the same work, and answers 401 in JSON.
 *
 * Auth accepts either transport, so the same routes serve the web app's cookie
 * and a native client's `Authorization: Bearer <token>` (the bearer plugin in
 * `lib/auth.ts` reads the header).
 */

export type ApiUser = { id: string; email: string; name: string };

export function withUser<Ctx>(
  handler: (request: Request, user: ApiUser, context: Ctx) => Promise<Response>,
): (request: Request, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    const session = await getSession();
    if (!session) return unauthorized();

    await applyUserCatalogFor(session.user.id);

    return handler(request, { id: session.user.id, email: session.user.email, name: session.user.name }, context);
  };
}
