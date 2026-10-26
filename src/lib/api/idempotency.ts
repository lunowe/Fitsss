/** What an `Idempotency-Key` may look like: a UUID fits, so does any client token of the same alphabet. */
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
