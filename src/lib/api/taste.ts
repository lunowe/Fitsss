import "server-only";

import { isUuid } from "@/lib/llm/generation-request";

/**
 * A taste scope from a request: absent or null is "overall", a style id is
 * that style. Anything else is refused rather than quietly read as overall.
 */
export function readScope(value: unknown): { ok: true; styleId: string | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, styleId: null };
  return isUuid(value) ? { ok: true, styleId: value.toLowerCase() } : { ok: false };
}
