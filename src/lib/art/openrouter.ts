/**
 * Plain-fetch transport for OpenRouter's OpenAI-compatible chat endpoint, plus
 * the price table used to cost a drawing.
 *
 * Deliberately dependency-free and provider-shaped: swapping in the app's own
 * LLM abstraction later means replacing this one function.
 */

import type { ChatFn, ChatRequest, ChatResult, ChatUsage } from "./types";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** USD per token. From `GET https://openrouter.ai/api/v1/models`. */
export interface ModelPrice {
  prompt: number;
  completion: number;
  cachedPrompt?: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "anthropic/claude-opus-5": { prompt: 5e-6, completion: 25e-6, cachedPrompt: 5e-7 },
  "openai/gpt-5.6-sol": { prompt: 2e-6, completion: 10e-6, cachedPrompt: 2e-7 },
};

export function costOf(model: string, usage: ChatUsage): number {
  const price = PRICES[model];
  if (!price) return 0;
  const cached = usage.cached_tokens ?? 0;
  const fresh = Math.max(0, usage.prompt_tokens - cached);
  return fresh * price.prompt + cached * (price.cachedPrompt ?? price.prompt) + usage.completion_tokens * price.completion;
}

export const emptyUsage = (): ChatUsage => ({ prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 });

export function addUsage(a: ChatUsage, b: ChatUsage): ChatUsage {
  return {
    prompt_tokens: a.prompt_tokens + b.prompt_tokens,
    completion_tokens: a.completion_tokens + b.completion_tokens,
    cached_tokens: (a.cached_tokens ?? 0) + (b.cached_tokens ?? 0),
  };
}

export interface OpenRouterOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Sent as the OpenRouter attribution headers. */
  appUrl?: string;
  appName?: string;
  /**
   * How long to wait for a whole answer. Drawing an SVG is a long generation
   * and OpenRouter holds the connection open with whitespace keep-alives while
   * the model works, so this covers reading the body, not just the headers.
   */
  timeoutMs?: number;
  /** Extra attempts after a timeout, a 429 or a 5xx. */
  retries?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Builds a `ChatFn` that talks to OpenRouter over plain `fetch`. */
export function openRouterChat({
  apiKey,
  fetchImpl,
  appUrl,
  appName = "Fitsss",
  timeoutMs = 240_000,
  retries = 1,
}: OpenRouterOptions): ChatFn {
  const call = fetchImpl ?? fetch;

  const once = async (request: ChatRequest): Promise<ChatResult> => {
    const started = Date.now();
    const response = await call(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(appUrl ? { "HTTP-Referer": appUrl } : {}),
        "X-Title": appName,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens ?? 8000,
        // Drawing an SVG runs for minutes. Streaming keeps bytes moving so the
        // timeout measures real stalls rather than the length of the answer,
        // and it sidesteps the provider buffering the whole thing first.
        stream: true,
        stream_options: { include_usage: true },
        ...(request.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok || !response.body) {
      const raw = (await response.text()).trim();
      const error = new Error(`openrouter ${response.status}: ${raw.slice(0, 400)}`);
      Object.assign(error, { status: response.status });
      throw error;
    }
    return finish(await readStream(response.body), request, started);
  };

  return async (request: ChatRequest): Promise<ChatResult> => {
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await once(request);
      } catch (error) {
        last = error;
        if (!isRetryable(error) || attempt === retries) break;
        await sleep(2000 * 2 ** attempt);
      }
    }
    throw last;
  };
}

/** A stall, a rate limit or a provider hiccup is worth another try. */
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 429 || (status !== undefined && status >= 500)) return true;
  const name = (error as { name?: string })?.name ?? "";
  const message = (error as { message?: string })?.message ?? "";
  return name === "TimeoutError" || name === "AbortError" || /timeout|aborted|fetch failed|socket/i.test(message);
}

interface OpenRouterBody {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

/**
 * Collects an SSE stream into the shape a non-streaming answer would have.
 *
 * OpenRouter pads the stream with `: ` keep-alive comments and ends with a
 * `[DONE]` sentinel; a final chunk carries the usage totals.
 */
async function readStream(body: ReadableStream<Uint8Array>): Promise<OpenRouterBody> {
  const decoder = new TextDecoder();
  const out: OpenRouterBody = { choices: [{ message: { content: "" } }] };
  let text = "";
  let buffer = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let at = buffer.indexOf("\n");
    while (at >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      at = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: {
        model?: string;
        error?: { message?: string };
        choices?: Array<{ delta?: { content?: string } }>;
        usage?: OpenRouterBody["usage"];
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.error) throw new Error(`openrouter: ${event.error.message ?? JSON.stringify(event.error)}`);
      if (event.model) out.model = event.model;
      if (event.usage) out.usage = event.usage;
      text += event.choices?.[0]?.delta?.content ?? "";
    }
  }
  out.choices = [{ message: { content: text } }];
  return out;
}

function finish(body: OpenRouterBody, request: ChatRequest, started: number): ChatResult {
  const usage: ChatUsage = {
    prompt_tokens: body.usage?.prompt_tokens ?? 0,
    completion_tokens: body.usage?.completion_tokens ?? 0,
    cached_tokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
  return {
    text: body.choices?.[0]?.message?.content ?? "",
    model: body.model ?? request.model,
    usage,
    ms: Date.now() - started,
    costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : undefined,
  };
}
