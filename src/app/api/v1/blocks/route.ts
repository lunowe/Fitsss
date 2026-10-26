import { data, failure, invalid, readJson } from "@/lib/api/respond";
import { IDEMPOTENCY_KEY_RE } from "@/lib/api/idempotency";
import { withUser } from "@/lib/api/route";
import { MAX_BATCH, createBlocksForUser, revalidateCloset } from "@/server/blocks-core";
import { listBlocksForUser } from "@/server/blocks-queries";

/** GET /api/v1/blocks?includeArchived=true */
export const GET = withUser(async (request, user) => {
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  return data(await listBlocksForUser(user.id, { includeArchived }));
});


/**
 * POST /api/v1/blocks
 *
 * Takes one block or an array of them, because the add flow is a cart: the
 * batch result reports per-index failures rather than rejecting the lot.
 *
 * Send an `Idempotency-Key` header (a fresh UUID per save) and resend the
 * same body with the same key when the answer never arrived: the repeat gets
 * the first answer back (`Idempotent-Replayed: true`) and nothing is stored
 * twice. Reusing a key for a different body is a 422.
 */
export const POST = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;

  const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
  if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    return invalid(["Idempotency-Key: 8 to 100 letters, digits, - or _"]);
  }

  const inputs = Array.isArray(body.value) ? body.value : [body.value];
  const outcome = await createBlocksForUser(user.id, inputs, { idempotencyKey });

  if (!outcome.ok) {
    switch (outcome.reason) {
      case "too-many":
        return invalid([`Save at most ${MAX_BATCH} different pieces at once`]);
      case "unreadable":
        return invalid(["That request is nested too deep to read"]);
      case "key-reused":
        // Not a validation error: a save with this key exists (or was
        // abandoned). The client must not read it as "nothing was stored".
        return failure(409, "idempotency_conflict", "Idempotency-Key was already used for a different request");
    }
  }
  const { result, replayed } = outcome;
  if (result.created.length === 0) {
    return invalid(result.failed.flatMap((f) => f.errors));
  }

  if (!replayed) revalidateCloset();
  const response = data(result, 201);
  if (replayed) response.headers.set("Idempotent-Replayed", "true");
  return response;
});
