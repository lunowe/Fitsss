import type { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { MAX_UPLOAD_BYTES, createInspoFromImageForUser, createInspoFromUrlForUser } from "@/server/inspo-core";

/**
 * The PWA share target.
 *
 * Android's share sheet POSTs here when the person shares a picture or a link
 * to Fitsss from Pinterest, Instagram or the browser. It is a route handler
 * rather than a server action because the manifest can only point at a URL,
 * and it always answers with a 303 so the browser turns the POST into a GET
 * and the person lands on a page instead of a blank response.
 *
 * The core functions are called directly rather than the server actions: those
 * redirect to /login on their own, and here a missing session has to produce a
 * redirect the share sheet can follow.
 */

const URL_RE = /https?:\/\/[^\s<>"']+/i;

function findUrl(...values: (string | null)[]): string | null {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const match = URL_RE.exec(trimmed);
    if (match) return match[0];
  }
  return null;
}

function seeOther(request: NextRequest, path: string): Response {
  return Response.redirect(new URL(path, request.nextUrl.origin), 303);
}

function str(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" ? value : null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return seeOther(request, "/login");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return seeOther(request, "/inspo/new?error=invalid");
  }

  const file = form.get("image");
  const result =
    file instanceof File && file.size > 0
      ? file.size > MAX_UPLOAD_BYTES
        ? ({ ok: false, code: "too-large" } as const)
        : await createInspoFromImageForUser(session.user.id, {
            bytes: Buffer.from(await file.arrayBuffer()),
            sourceUrl: findUrl(str(form, "url"), str(form, "text")),
          })
      : await (async () => {
          const url = findUrl(str(form, "url"), str(form, "text"), str(form, "title"));
          if (!url) return { ok: false, code: "invalid" } as const;
          return createInspoFromUrlForUser(session.user.id, url);
        })();

  if (!result.ok) {
    return seeOther(request, `/inspo/new?error=${encodeURIComponent(result.code)}`);
  }
  return seeOther(request, `/inspo/${result.inspo.id}`);
}
