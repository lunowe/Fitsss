import type * as z from "zod/v4";
import {
  LLM_PROVIDER_KEY_VAR,
  type LlmEffortLevel,
  type LlmSettings,
  type LlmTask,
} from "@/lib/settings/llm";
import { callAnthropic, isAnthropicConfigured } from "./providers/anthropic";
import { callOpenRouter, isOpenRouterConfigured } from "./providers/openrouter";

/**
 * One structured call, whoever answers it.
 *
 * The three features that talk to a model (outfits, taste notes, picture
 * reading) all want the same thing: a frozen system prompt, one user message,
 * and an answer that satisfies a zod schema. That is the whole interface — the
 * provider modules underneath translate it into an Anthropic SDK call or an
 * OpenAI-compatible HTTP request, and translate every way it can fail into one
 * of six codes the call sites already know how to phrase.
 */

/** A user message: plain text, or text and pictures in order. */
export type UserContent =
  | string
  | Array<{ type: "text"; text: string } | { type: "image"; mime: string; base64: string }>;

export interface StructuredCall<T> {
  task: LlmTask;
  /** The frozen system prompt. Providers that cache prefixes mark it themselves. */
  system: string;
  user: UserContent;
  schema: z.ZodType<T>;
  /** Identifier for the schema in the request. Lowercase, no spaces. */
  schemaName: string;
  maxTokens: number;
  /** Overrides the configured effort for this one call (the summarizer is cheap on purpose). */
  effort?: LlmEffortLevel;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export type StructuredErrorCode =
  | "not-configured"
  | "refusal"
  | "invalid-output"
  | "rate-limit"
  | "network"
  | "api";

export type StructuredResult<T> =
  | { ok: true; value: T; model: string; usage: LlmUsage }
  | { ok: false; code: StructuredErrorCode; error: string; status?: number };

/** Shared shape of a provider module, so `callStructured` stays a lookup. */
export interface ProviderCall {
  <T>(call: StructuredCall<T>, settings: LlmSettings): Promise<StructuredResult<T>>;
}

export function providerConfigured(settings: LlmSettings): { ok: true } | { ok: false; error: string } {
  switch (settings.provider) {
    case "mock":
      return { ok: true };
    case "openrouter":
      return isOpenRouterConfigured()
        ? { ok: true }
        : {
            ok: false,
            error: `No OpenRouter key yet. Add ${LLM_PROVIDER_KEY_VAR.openrouter} to .env.local, or switch the provider under You → AI model.`,
          };
    case "anthropic":
      return isAnthropicConfigured()
        ? { ok: true }
        : {
            ok: false,
            error: `No Anthropic key yet. Add ${LLM_PROVIDER_KEY_VAR.anthropic} to .env.local, or switch the provider under You → AI model.`,
          };
  }
}

/**
 * Runs one structured call against the configured provider.
 *
 * Never throws: every failure comes back as `{ ok: false }` with a code, so the
 * call sites keep returning `{ ok, error }` results instead of 500ing.
 */
export async function callStructured<T>(
  call: StructuredCall<T>,
  settings: LlmSettings,
): Promise<StructuredResult<T>> {
  if (settings.provider === "mock") {
    return {
      ok: false,
      code: "not-configured",
      error: "The mock provider does not make model calls. Pick OpenRouter or Anthropic first.",
    };
  }

  const configured = providerConfigured(settings);
  if (!configured.ok) return { ok: false, code: "not-configured", error: configured.error };

  try {
    return settings.provider === "anthropic"
      ? await callAnthropic(call, settings)
      : await callOpenRouter(call, settings);
  } catch (error) {
    // A provider module is meant to map its own failures; anything that escapes
    // is a bug, and a bug must not take the whole request down.
    console.error("[llm] unmapped provider failure", error);
    return { ok: false, code: "api", error: "The model call failed unexpectedly. Try again." };
  }
}
