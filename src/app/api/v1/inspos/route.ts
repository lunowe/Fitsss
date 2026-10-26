import { after } from "next/server";
import type { Inspo } from "@/domain";
import { data, failure, invalid, readCappedBody, readJson, tooLarge } from "@/lib/api/respond";
import { apiInspo, inspoFailure } from "@/lib/api/inspo";
import { withUser } from "@/lib/api/route";
import {
  MAX_UPLOAD_BYTES,
  analyzeInspoForUser,
  storeInspoFromImageForUser,
  storeInspoFromUrlForUser,
} from "@/server/inspo-core";
import { listInsposForUser } from "@/server/inspo-queries";

/** GET /api/v1/inspos — saved pictures, newest first, without their bytes. */
export const GET = withUser(async (_request, user) => {
  return data((await listInsposForUser(user.id)).map(apiInspo));
});

/**
 * POST /api/v1/inspos — adds a picture, unread (`analysis: null`); reading
 * it is `POST …/:id/analyze`, which takes as long as the model does.
 *
 * - `Content-Type: application/json`, `{ url }`: a picture link, or a page
 *   that has one (a Pinterest pin). 422 `fetch_failed` when nothing usable
 *   came back: suggest a screenshot.
 * - `Content-Type: image/*`: the bytes of an already-resized JPEG, PNG, WebP
 *   or GIF (at most 4 MB, else 413), with an optional `?sourceUrl=`.
 *
 * The same picture twice is one inspo: a repeat answers 200 with the one
 * already there instead of 201, so a retry after a lost answer is safe.
 *
 * `?analyze=1` starts reading an unread picture once the answer is sent, for
 * a client that can't wait for it (the share extension). A later
 * `…/analyze` while that read runs waits for it rather than paying twice.
 */
export const POST = withUser(async (request, user) => {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const params = new URL(request.url).searchParams;
  const stored = (inspo: Inspo, existing: boolean) => {
    if (params.get("analyze") === "1" && !inspo.analysis) {
      after(async () => {
        try {
          await analyzeInspoForUser(user.id, inspo.id);
        } catch (error) {
          console.warn("[inspo] background read failed:", error);
        }
      });
    }
    return data(apiInspo(inspo), existing ? 200 : 201);
  };

  if (type === "application/json") {
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const url =
      typeof body.value === "object" && body.value !== null ? (body.value as { url?: unknown }).url : undefined;
    if (typeof url !== "string") return invalid(["Paste a link first."]);

    const result = await storeInspoFromUrlForUser(user.id, url);
    return result.ok ? stored(result.inspo, result.existing) : inspoFailure(result);
  }

  if (type.startsWith("image/") || type === "application/octet-stream") {
    const bytes = await readCappedBody(request, MAX_UPLOAD_BYTES);
    if (!bytes) return tooLarge("That picture is too big. Pick a smaller one.");
    const result = await storeInspoFromImageForUser(user.id, { bytes, sourceUrl: params.get("sourceUrl") });
    return result.ok ? stored(result.inspo, result.existing) : inspoFailure(result);
  }

  return failure(415, "invalid_body", "Send JSON with a url, or the picture's bytes as image/*.");
});
