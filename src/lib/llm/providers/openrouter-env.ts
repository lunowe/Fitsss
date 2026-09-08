/**
 * Where OpenRouter lives and how to sign in to it.
 *
 * Its own module because both the chat endpoint and the model catalogue need
 * it, and the catalogue is what tells the chat endpoint whether a model takes a
 * `reasoning` parameter — so putting these in either one would make the pair
 * import each other.
 */

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/** OPENROUTER_BASE_URL exists for a gateway in front of the API, and for tests. */
export function openRouterBaseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL?.trim() || OPENROUTER_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function openRouterKey(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

export function isOpenRouterConfigured(): boolean {
  return openRouterKey() !== null;
}

/** Sent so the app shows up by name on the OpenRouter activity page. */
export const OPENROUTER_HEADERS = {
  "HTTP-Referer": "http://localhost:3100",
  "X-Title": "Fitsss",
} as const;
