import type { LlmSettings } from "@/lib/settings/llm";
import { extractJson, stripNulls, toStrictJsonSchema } from "../json-schema";
import { supportsReasoning } from "../models";
import type { StructuredCall, StructuredErrorCode, StructuredResult, UserContent } from "../provider";
import { OPENROUTER_HEADERS, openRouterBaseUrl, openRouterKey } from "./openrouter-env";

/**
 * OpenRouter, over its OpenAI-compatible chat-completions endpoint.
 *
 * Deliberately plain `fetch`: the whole surface we use is one POST with a
 * `response_format`, and adding an SDK for that would buy nothing. The two
 * things that are not obvious:
 *
 * - `reasoning` is only sent to models that advertise it, because a model that
 *   does not know the parameter rejects the request outright.
 * - `strict` json_schema wants every property required, so `toStrictJsonSchema`
 *   makes the optional ones nullable and `stripNulls` undoes that afterwards.
 *   The answer is then validated with the zod schema regardless of whether the
 *   model honoured the format at all.
 */

// Long models (reasoning on) can take a couple of minutes; OpenRouter keeps the
// socket alive with whitespace while the upstream works, so the timer must cover
// the body read, not just the headers.
const REQUEST_TIMEOUT_MS = 180_000;

export {
  OPENROUTER_DEFAULT_BASE_URL,
  OPENROUTER_HEADERS,
  isOpenRouterConfigured,
  openRouterBaseUrl,
  openRouterKey,
} from "./openrouter-env";

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

type OpenAiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function userMessageContent(user: UserContent): string | OpenAiPart[] {
  if (typeof user === "string") return user;
  return user.map((part): OpenAiPart =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : { type: "image_url", image_url: { url: `data:${part.mime};base64,${part.base64}` } },
  );
}

interface OpenRouterResponse {
  choices?: {
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    error?: { message?: string } | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  } | null;
  error?: { message?: string; code?: number | string } | null;
  model?: string;
}

function httpCode(status: number): StructuredErrorCode {
  if (status === 401 || status === 403) return "not-configured";
  if (status === 429) return "rate-limit";
  if (status >= 500) return "api";
  return "api";
}

function httpMessage(status: number, detail: string | null): string {
  if (status === 401 || status === 403) {
    return "OpenRouter rejected the key. Check that OPENROUTER_API_KEY is set and valid.";
  }
  if (status === 429) return "OpenRouter is rate limiting right now. Try again in a moment.";
  if (status === 402) return "OpenRouter has no credit left on this key.";
  if (status >= 500) return `OpenRouter returned an error (${status}). Try again.`;
  return detail
    ? `OpenRouter rejected the request (${status}): ${detail}`
    : `OpenRouter rejected the request (${status}).`;
}

function errorDetail(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") return parsed.error;
    const message = parsed.error?.message;
    return typeof message === "string" ? message.slice(0, 300) : null;
  } catch {
    return body.trim().slice(0, 300) || null;
  }
}

export async function callOpenRouter<T>(
  call: StructuredCall<T>,
  settings: LlmSettings,
): Promise<StructuredResult<T>> {
  const key = openRouterKey();
  if (!key) {
    return {
      ok: false,
      code: "not-configured",
      error: "No OpenRouter key yet. Add OPENROUTER_API_KEY to .env.local.",
    };
  }

  const model = settings.models[call.task];

  const body: Record<string, unknown> = {
    model,
    max_tokens: call.maxTokens,
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: userMessageContent(call.user) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: call.schemaName,
        strict: true,
        schema: toStrictJsonSchema(call.schema),
      },
    },
  };

  // Sent only where it is understood: an unknown parameter is a 400, not a
  // silently ignored field, on some of the providers behind OpenRouter.
  if (await supportsReasoning(model)) {
    body.reasoning = { effort: call.effort ?? settings.effort };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${openRouterBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...OPENROUTER_HEADERS,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      code: "network",
      error: aborted
        ? `${model} did not answer within ${REQUEST_TIMEOUT_MS / 1000}s. Try again, or pick a faster model.`
        : "Could not reach OpenRouter. Check your connection and try again.",
    };
  }

  if (!response.ok) {
    const detail = errorDetail(await response.text().catch(() => ""));
    clearTimeout(timer);
    return {
      ok: false,
      code: httpCode(response.status),
      error: httpMessage(response.status, detail),
      status: response.status,
    };
  }

  let payload: OpenRouterResponse;
  try {
    const raw = await response.text();
    payload = JSON.parse(raw.trim()) as OpenRouterResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        code: "network",
        error: `${model} did not finish within ${REQUEST_TIMEOUT_MS / 1000}s. Try again, or pick a faster model.`,
      };
    }
    return { ok: false, code: "api", error: "OpenRouter returned something that was not JSON." };
  } finally {
    clearTimeout(timer);
  }

  // A 200 can still carry an error: OpenRouter reports upstream failures in the
  // body once it has started streaming a response back.
  if (payload.error) {
    const status = typeof payload.error.code === "number" ? payload.error.code : undefined;
    return {
      ok: false,
      code: status ? httpCode(status) : "api",
      error: payload.error.message?.slice(0, 300) || "OpenRouter returned an error.",
      ...(status ? { status } : {}),
    };
  }

  const choice = payload.choices?.[0];
  if (choice?.message?.refusal) {
    return { ok: false, code: "refusal", error: "The model declined this request." };
  }
  if (choice?.finish_reason === "content_filter") {
    return { ok: false, code: "refusal", error: "The model declined this request." };
  }

  const usage = {
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
    cacheReadInputTokens: payload.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };

  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    const truncated = choice?.finish_reason === "length";
    return {
      ok: false,
      code: truncated ? "invalid-output" : "api",
      error: truncated
        ? `${model} ran out of room before finishing the answer.`
        : "The model returned an empty answer.",
    };
  }

  let raw: unknown;
  try {
    raw = stripNulls(extractJson(content));
  } catch {
    return {
      ok: false,
      code: "invalid-output",
      error: `${model} did not return JSON. Pick a model that supports structured output.`,
    };
  }

  const parsed = call.schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path?.length ? ` at ${first.path.join(".")}` : "";
    return {
      ok: false,
      code: "invalid-output",
      error: `${model} returned an answer in the wrong shape${where}: ${first?.message ?? "unknown problem"}.`,
    };
  }

  return { ok: true, value: parsed.data, model: payload.model || model, usage };
}
