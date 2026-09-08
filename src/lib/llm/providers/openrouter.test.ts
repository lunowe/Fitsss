import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";
import type { LlmSettings } from "@/lib/settings/llm";
import { clearModelCache } from "../models";
import type { StructuredCall } from "../provider";
import { callOpenRouter } from "./openrouter";

/**
 * The OpenRouter path with the network stubbed out.
 *
 * Everything that decides whether a real generation works is here: the shape of
 * the request body, whether `reasoning` is sent, and how many ways an answer
 * can arrive and still be usable.
 */

const schema = z.object({
  name: z.string(),
  tip: z.string().optional(),
  rows: z.array(z.object({ id: z.string(), note: z.string().optional() })),
});

const settings: LlmSettings = {
  provider: "openrouter",
  models: { outfits: "vendor/thinker", taste: "vendor/plain", vision: "vendor/thinker" },
  effort: "high",
};

function call(overrides: Partial<StructuredCall<z.infer<typeof schema>>> = {}) {
  return {
    task: "outfits" as const,
    system: "SYSTEM",
    user: "USER",
    schema,
    schemaName: "answer",
    maxTokens: 1234,
    ...overrides,
  };
}

const CATALOGUE = {
  data: [
    {
      id: "vendor/thinker",
      name: "Thinker",
      context_length: 1000,
      pricing: { prompt: "0.000001", completion: "0.000002" },
      architecture: { input_modalities: ["text", "image"] },
      supported_parameters: ["response_format", "reasoning"],
    },
    {
      id: "vendor/plain",
      name: "Plain",
      context_length: 1000,
      pricing: { prompt: "0.0000005", completion: "0.000001" },
      architecture: { input_modalities: ["text"] },
      supported_parameters: ["structured_outputs"],
    },
  ],
};

/** The completion body a well-behaved model returns. */
function completion(content: string, extra: Record<string, unknown> = {}) {
  return {
    model: "vendor/thinker",
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 11, completion_tokens: 22, prompt_tokens_details: { cached_tokens: 3 } },
    ...extra,
  };
}

type Reply = { status?: number; body?: unknown; text?: string; throws?: Error };

let requests: { url: string; init: RequestInit }[] = [];

function stubFetch(chat: Reply) {
  requests = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    requests.push({ url: String(url), init });

    if (String(url).endsWith("/models")) {
      return new Response(JSON.stringify(CATALOGUE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (chat.throws) throw chat.throws;
    const body = chat.text ?? JSON.stringify(chat.body ?? {});
    return new Response(body, {
      status: chat.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
}

/** The parsed body of the chat request, which is the interesting one. */
function chatBody(): Record<string, unknown> {
  const chat = requests.find((request) => request.url.endsWith("/chat/completions"));
  if (!chat) throw new Error("no chat request was made");
  return JSON.parse(String(chat.init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  clearModelCache();
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_BASE_URL", "https://example.test/api/v1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("callOpenRouter request", () => {
  it("sends the model, the messages and a strict json_schema", async () => {
    stubFetch({ body: completion('{"name":"a","rows":[]}') });
    await callOpenRouter(call(), settings);

    const body = chatBody();
    expect(body.model).toBe("vendor/thinker");
    expect(body.max_tokens).toBe(1234);
    expect(body.messages).toEqual([
      { role: "system", content: "SYSTEM" },
      { role: "user", content: "USER" },
    ]);

    const format = body.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: { required: string[] } };
    };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.name).toBe("answer");
    expect(format.json_schema.strict).toBe(true);
    // The optional `tip` is required-and-nullable in the emitted schema.
    expect(format.json_schema.schema.required).toEqual(["name", "tip", "rows"]);
  });

  it("identifies the app and the key in the headers", async () => {
    stubFetch({ body: completion('{"name":"a","rows":[]}') });
    await callOpenRouter(call(), settings);

    const chat = requests.find((request) => request.url.endsWith("/chat/completions"))!;
    const headers = chat.init.headers as Record<string, string>;
    expect(chat.url).toBe("https://example.test/api/v1/chat/completions");
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["HTTP-Referer"]).toBe("http://localhost:3100");
    expect(headers["X-Title"]).toBe("Fitsss");
  });

  it("sends reasoning only to a model that advertises it", async () => {
    stubFetch({ body: completion('{"name":"a","rows":[]}') });
    await callOpenRouter(call(), settings);
    expect(chatBody().reasoning).toEqual({ effort: "high" });

    stubFetch({ body: completion('{"name":"a","rows":[]}') });
    await callOpenRouter(call({ task: "taste" }), settings);
    expect(chatBody().reasoning).toBeUndefined();
  });

  it("lets a per-call effort override the configured one", async () => {
    stubFetch({ body: completion('{"name":"a","rows":[]}') });
    await callOpenRouter(call({ effort: "low" }), settings);
    expect(chatBody().reasoning).toEqual({ effort: "low" });
  });

  it("turns an image part into a data URL", async () => {
    stubFetch({ body: completion('{"name":"a","rows":[]}') });
    await callOpenRouter(
      call({
        user: [
          { type: "text", text: "look" },
          { type: "image", mime: "image/png", base64: "QUJD" },
        ],
      }),
      settings,
    );

    const messages = chatBody().messages as { role: string; content: unknown }[];
    expect(messages[1].content).toEqual([
      { type: "text", text: "look" },
      { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
    ]);
  });

  it("refuses to call without a key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    stubFetch({ body: completion('{"name":"a","rows":[]}') });

    const result = await callOpenRouter(call(), settings);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("not-configured");
  });
});

describe("callOpenRouter answers", () => {
  it("returns the parsed value, the model and the usage", async () => {
    stubFetch({ body: completion('{"name":"Quiet Monday","tip":null,"rows":[{"id":"a","note":null}]}') });

    const result = await callOpenRouter(call(), settings);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toEqual({ name: "Quiet Monday", rows: [{ id: "a" }] });
    expect(result.model).toBe("vendor/thinker");
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 22, cacheReadInputTokens: 3 });
  });

  it("survives a model that fences its JSON", async () => {
    stubFetch({ body: completion('```json\n{"name":"a","rows":[]}\n```') });
    const result = await callOpenRouter(call(), settings);
    expect(result.ok && result.value.name).toBe("a");
  });

  it("survives a model that chats before the JSON", async () => {
    stubFetch({ body: completion('Sure!\n{"name":"a","rows":[]}') });
    const result = await callOpenRouter(call(), settings);
    expect(result.ok && result.value.name).toBe("a");
  });

  it("reports an answer in the wrong shape as invalid-output", async () => {
    stubFetch({ body: completion('{"name":42,"rows":[]}') });
    const result = await callOpenRouter(call(), settings);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("invalid-output");
    expect(result.error).toContain("name");
  });

  it("reports a non-JSON answer as invalid-output", async () => {
    stubFetch({ body: completion("I would rather not.") });
    const result = await callOpenRouter(call(), settings);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("invalid-output");
  });

  it("reports a truncated answer as invalid-output", async () => {
    stubFetch({
      body: { choices: [{ message: { content: "" }, finish_reason: "length" }], usage: {} },
    });
    const result = await callOpenRouter(call(), settings);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("invalid-output");
    expect(result.error).toContain("ran out of room");
  });

  it("reports a refusal", async () => {
    stubFetch({
      body: { choices: [{ message: { refusal: "no" }, finish_reason: "stop" }], usage: {} },
    });
    const result = await callOpenRouter(call(), settings);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("refusal");
  });

  it("reports an error carried inside a 200", async () => {
    stubFetch({ body: { error: { message: "upstream fell over", code: 502 } } });
    const result = await callOpenRouter(call(), settings);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("api");
    expect(result.error).toContain("upstream fell over");
  });
});

describe("callOpenRouter failures", () => {
  const cases = [
    { status: 401, code: "not-configured", match: /OPENROUTER_API_KEY/ },
    { status: 429, code: "rate-limit", match: /rate limiting/ },
    { status: 402, code: "api", match: /credit/ },
    { status: 500, code: "api", match: /\(500\)/ },
  ] as const;

  for (const { status, code, match } of cases) {
    it(`maps HTTP ${status} to ${code}`, async () => {
      stubFetch({ status, text: JSON.stringify({ error: { message: "nope" } }) });
      const result = await callOpenRouter(call(), settings);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.code).toBe(code);
      expect(result.status).toBe(status);
      expect(result.error).toMatch(match);
    });
  }

  it("maps a dropped connection to network", async () => {
    stubFetch({ throws: new TypeError("fetch failed") });
    const result = await callOpenRouter(call(), settings);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("network");
  });

  it("maps a timeout to network and names the model", async () => {
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    stubFetch({ throws: aborted });

    const result = await callOpenRouter(call(), settings);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("network");
    expect(result.error).toContain("vendor/thinker");
  });
});
