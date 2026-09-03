/**
 * Pure validation for style input. Kept out of `styles.ts` because a
 * `"use server"` module may only export async functions, and out of
 * `styles-queries.ts` because that one is `server-only`. Unit tested.
 */

export const MAX_ACTIVE_STYLES = 6;
export const MAX_STYLE_NAME = 40;
export const MAX_STYLE_TEXT = 600;

/** The fields a user can set on a style. */
export interface StyleInput {
  name: string;
  description: string;
  /** One rule per line, or null when the user left it empty. */
  rules: string | null;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Collapses blank lines and trims each rule; returns null when nothing is left. */
export function normalizeRules(raw: unknown): string | null {
  const lines = asString(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

export function validateStyleInput(input: unknown): Validated<StyleInput> {
  const errors: string[] = [];
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;

  const name = asString(raw.name).trim();
  if (!name) errors.push("A style needs a name");
  else if (name.length > MAX_STYLE_NAME) errors.push(`Keep the name under ${MAX_STYLE_NAME} characters`);

  const description = asString(raw.description).trim();
  if (description.length > MAX_STYLE_TEXT) {
    errors.push(`Keep the description under ${MAX_STYLE_TEXT} characters`);
  }

  const rules = normalizeRules(raw.rules);
  if ((rules?.length ?? 0) > MAX_STYLE_TEXT) {
    errors.push(`Keep the rules under ${MAX_STYLE_TEXT} characters`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { name, description, rules } };
}

/** The message shown when the user is already at the style limit. */
export const STYLE_LIMIT_ERROR = `You can keep up to ${MAX_ACTIVE_STYLES} styles`;
