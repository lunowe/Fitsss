import Anthropic from "@anthropic-ai/sdk";

/**
 * One Anthropic client for the whole app.
 *
 * `new Anthropic()` resolves credentials from the environment on its own:
 * ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN), and ANTHROPIC_BASE_URL when a
 * proxy or gateway is in front of the API. Nothing is hard-coded here.
 */

export const DEFAULT_LLM_MODEL = "claude-opus-5";

export const LLM_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type LlmEffort = (typeof LLM_EFFORTS)[number];

export const DEFAULT_LLM_EFFORT: LlmEffort = "medium";

/** True when the SDK will find a credential. The UI uses this to explain itself instead of 500ing. */
export function isLlmConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const token = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  return Boolean(key || token);
}

export function llmModel(): string {
  return process.env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL;
}

export function llmEffort(): LlmEffort {
  const raw = process.env.LLM_EFFORT?.trim().toLowerCase();
  return (LLM_EFFORTS as readonly string[]).includes(raw ?? "")
    ? (raw as LlmEffort)
    : DEFAULT_LLM_EFFORT;
}

let cached: Anthropic | null = null;

/** Lazily constructed singleton. Throws only if called without a credential. */
export function getLlmClient(): Anthropic {
  if (!cached) cached = new Anthropic();
  return cached;
}
