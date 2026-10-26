import "server-only";

/**
 * One response envelope for every `/api/v1` route, so a client has exactly two
 * shapes to parse: `{ data }` or `{ error }`.
 *
 * `invalid` carries the domain validators' own messages through untouched —
 * the point of `validateBlockInput` returning `{ ok, errors }` is that the
 * boundary never has to restate the rules.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_input"
  | "invalid_body"
  | "method_not_allowed"
  // Outfit generation: the closet can't support a request, or the model failed.
  | "empty_closet"
  | "too_few_pieces"
  | "not_configured"
  | "generation_failed"
  | "idempotency_conflict"
  // Inspo: a link that gave no picture, a picture too big, a read that failed.
  | "fetch_failed"
  | "too_large"
  | "analysis_failed"
  // Taste: not enough feedback to learn from, or the model failed.
  | "too_few_events"
  | "refresh_failed"
  // AI model settings: the test call came back wrong, or too many tests.
  | "test_failed"
  | "rate_limited";

export function data<T>(payload: T, status = 200): Response {
  return Response.json({ data: payload }, { status });
}

export function failure(
  status: number,
  code: ApiErrorCode,
  message: string,
  errors?: string[],
): Response {
  return Response.json({ error: { code, message, ...(errors ? { errors } : {}) } }, { status });
}

export const unauthorized = () =>
  failure(401, "unauthorized", "Sign in to use this endpoint.");

export const notFound = (what = "That is gone") => failure(404, "not_found", what);

export const invalid = (errors: string[]) =>
  failure(422, "invalid_input", "The input did not validate.", errors);

/**
 * JSON bodies are small: a cart of 500 pieces with long notes is well under
 * this. Anything bigger is refused before it is held in memory.
 */
export const MAX_JSON_BYTES = 4 * 1024 * 1024;

export const tooLarge = (message = "That request is too large.") => failure(413, "too_large", message);

/**
 * The body, or null once it passes `max` bytes: a declared length over the
 * cap is refused unread, and a streamed one is read no further than the cap.
 */
export async function readCappedBody(request: Request, max: number): Promise<Buffer | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return Buffer.alloc(0);

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Parses a JSON body, turning a malformed one into a 400 and a huge one into a 413. */
export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const body = await readCappedBody(request, MAX_JSON_BYTES);
  if (!body) return { ok: false, response: tooLarge() };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) };
  } catch {
    return { ok: false, response: failure(400, "invalid_body", "Expected a JSON body.") };
  }
}

/** The same, except that no body at all reads as `{}`. */
export async function readOptionalJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const body = await readCappedBody(request, MAX_JSON_BYTES);
  if (!body) return { ok: false, response: tooLarge() };
  // TextDecoder drops a byte-order mark, as `request.json()` does.
  const text = new TextDecoder().decode(body);
  if (!text.trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: failure(400, "invalid_body", "Expected a JSON body.") };
  }
}
