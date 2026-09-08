import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { LlmSettings } from "@/lib/settings/llm";
import type { StructuredCall, StructuredErrorCode, StructuredResult } from "../provider";

/**
 * The Anthropic SDK path: adaptive thinking, effort, a cached system block.
 *
 * `new Anthropic()` resolves credentials from the environment on its own —
 * ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN), plus ANTHROPIC_BASE_URL when a
 * proxy sits in front of the API — so nothing is hard-coded here.
 */

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
}

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  cached ??= new Anthropic();
  return cached;
}

/**
 * Model ids are stored OpenRouter-style ("anthropic/claude-opus-5"); the SDK
 * wants the bare name. Any other vendor prefix is left alone so the resulting
 * 404 names the model the person actually picked.
 */
export function toAnthropicModel(id: string): string {
  return id.startsWith("anthropic/") ? id.slice("anthropic/".length) : id;
}

function messageContent(call: StructuredCall<unknown>): Anthropic.ContentBlockParam[] | string {
  if (typeof call.user === "string") return call.user;
  return call.user.map((part) =>
    part.type === "text"
      ? { type: "text" as const, text: part.text }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: part.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: part.base64,
          },
        },
  );
}

function describe(error: unknown): { code: StructuredErrorCode; error: string; status?: number } {
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      code: "not-configured",
      error: "Could not sign in to the Claude API. Check that ANTHROPIC_API_KEY is set and valid.",
      status: error.status,
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { code: "rate-limit", error: "Rate limited right now. Try again in a moment.", status: 429 };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { code: "network", error: "Could not reach the Claude API. Check your connection and try again." };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      code: "api",
      error: `The Claude API returned an error (${error.status ?? "unknown"}).`,
      status: error.status,
    };
  }
  return { code: "api", error: "The model call failed. Try again." };
}

export async function callAnthropic<T>(
  call: StructuredCall<T>,
  settings: LlmSettings,
): Promise<StructuredResult<T>> {
  const model = toAnthropicModel(settings.models[call.task]);

  let message;
  try {
    message = await getAnthropicClient().messages.parse({
      model,
      max_tokens: call.maxTokens,
      thinking: { type: "adaptive" },
      output_config: {
        effort: call.effort ?? settings.effort,
        format: zodOutputFormat(call.schema),
      },
      // Frozen prefix: marked ephemeral so every call after the first is a
      // cache read rather than a re-read of the same instructions.
      system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: messageContent(call) }],
    });
  } catch (error) {
    return { ok: false, ...describe(error) };
  }

  if (message.stop_reason === "refusal") {
    return { ok: false, code: "refusal", error: "The model declined this request." };
  }

  const parsed = message.parsed_output;
  if (parsed === null || parsed === undefined) {
    return { ok: false, code: "invalid-output", error: "The model returned nothing usable." };
  }

  return {
    ok: true,
    value: parsed as T,
    model,
    usage: {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
