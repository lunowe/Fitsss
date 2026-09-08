import { describe, expect, it } from "vitest";
import {
  DEFAULT_LLM_SETTINGS,
  isMockEnv,
  llmEnvOverrides,
  parseLlmSettings,
  resolveLlmSettings,
  validateLlmSettings,
} from "./llm";

describe("parseLlmSettings", () => {
  it("fills every field from the defaults when the column is empty", () => {
    expect(parseLlmSettings({})).toEqual(DEFAULT_LLM_SETTINGS);
    expect(parseLlmSettings(null)).toEqual(DEFAULT_LLM_SETTINGS);
    expect(parseLlmSettings("nonsense")).toEqual(DEFAULT_LLM_SETTINGS);
  });

  it("keeps the fields it can read and defaults the rest", () => {
    const parsed = parseLlmSettings({
      provider: "anthropic",
      models: { outfits: "openai/gpt-5.6-sol", taste: 42 },
      effort: "loud",
    });
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.models.outfits).toBe("openai/gpt-5.6-sol");
    expect(parsed.models.taste).toBe(DEFAULT_LLM_SETTINGS.models.taste);
    expect(parsed.effort).toBe(DEFAULT_LLM_SETTINGS.effort);
  });

  it("rejects model ids that are not id-shaped", () => {
    const parsed = parseLlmSettings({ models: { outfits: "a model; rm -rf /" } });
    expect(parsed.models.outfits).toBe(DEFAULT_LLM_SETTINGS.models.outfits);
  });

  it("trims whitespace around a model id", () => {
    expect(parseLlmSettings({ models: { vision: "  google/gemini-3.8-flash " } }).models.vision).toBe(
      "google/gemini-3.8-flash",
    );
  });
});

describe("validateLlmSettings", () => {
  it("accepts a complete, valid payload", () => {
    const result = validateLlmSettings({
      provider: "openrouter",
      models: { outfits: "a/b", taste: "c/d", vision: "e/f" },
      effort: "high",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        provider: "openrouter",
        models: { outfits: "a/b", taste: "c/d", vision: "e/f" },
        effort: "high",
      },
    });
  });

  it("reports an unknown provider and a bad model id instead of throwing", () => {
    const result = validateLlmSettings({ provider: "openai", models: { vision: "" } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]).toMatch(/provider/i);
    expect(result.errors[1]).toMatch(/Picture reading/);
  });

  it("treats a missing field as untouched, not as an error", () => {
    expect(validateLlmSettings({ effort: "low" }).ok).toBe(true);
  });
});

describe("isMockEnv", () => {
  it("is off for an unset or blanked variable", () => {
    expect(isMockEnv({})).toBe(false);
    expect(isMockEnv({ LLM_MOCK: "" })).toBe(false);
    expect(isMockEnv({ LLM_MOCK: "  " })).toBe(false);
    expect(isMockEnv({ LLM_MOCK: "0" })).toBe(false);
    expect(isMockEnv({ LLM_MOCK: "false" })).toBe(false);
  });

  it("is on for 1 or any other value", () => {
    expect(isMockEnv({ LLM_MOCK: "1" })).toBe(true);
    expect(isMockEnv({ LLM_MOCK: "yes" })).toBe(true);
  });
});

describe("resolveLlmSettings", () => {
  const stored = {
    provider: "anthropic",
    models: { outfits: "a/outfits", taste: "a/taste", vision: "a/vision" },
    effort: "low",
  };

  it("returns the stored settings when nothing is set in the environment", () => {
    expect(resolveLlmSettings(stored, {})).toEqual(stored);
  });

  it("ignores empty env vars", () => {
    expect(
      resolveLlmSettings(stored, { LLM_PROVIDER: "", LLM_MODEL: "  ", LLM_EFFORT: "" }),
    ).toEqual(stored);
  });

  it("lets a per-task model override the stored one", () => {
    const resolved = resolveLlmSettings(stored, { LLM_MODEL_VISION: "google/gemini-3.8-flash" });
    expect(resolved.models.vision).toBe("google/gemini-3.8-flash");
    expect(resolved.models.outfits).toBe("a/outfits");
  });

  it("uses the legacy LLM_MODEL for every task, and lets a per-task var win", () => {
    const resolved = resolveLlmSettings(stored, {
      LLM_MODEL: "legacy/all",
      LLM_MODEL_TASTE: "specific/taste",
    });
    expect(resolved.models.outfits).toBe("legacy/all");
    expect(resolved.models.vision).toBe("legacy/all");
    expect(resolved.models.taste).toBe("specific/taste");
  });

  it("overrides the provider and the effort", () => {
    const resolved = resolveLlmSettings(stored, { LLM_PROVIDER: "openrouter", LLM_EFFORT: "high" });
    expect(resolved.provider).toBe("openrouter");
    expect(resolved.effort).toBe("high");
  });

  it("ignores a provider or effort the app does not know", () => {
    const resolved = resolveLlmSettings(stored, { LLM_PROVIDER: "groq", LLM_EFFORT: "max" });
    expect(resolved.provider).toBe("anthropic");
    expect(resolved.effort).toBe("low");
  });

  it("LLM_MOCK forces the mock provider over everything else", () => {
    expect(resolveLlmSettings(stored, { LLM_MOCK: "1", LLM_PROVIDER: "openrouter" }).provider).toBe(
      "mock",
    );
  });

  it("falls back to the defaults when nothing is stored", () => {
    expect(resolveLlmSettings(undefined, {})).toEqual(DEFAULT_LLM_SETTINGS);
  });
});

describe("llmEnvOverrides", () => {
  it("names nothing when the environment is empty", () => {
    expect(llmEnvOverrides({})).toEqual({
      provider: null,
      models: { outfits: null, taste: null, vision: null },
      effort: null,
    });
  });

  it("names the variable that pinned each field", () => {
    const overrides = llmEnvOverrides({
      LLM_MOCK: "1",
      LLM_MODEL: "legacy/all",
      LLM_MODEL_VISION: "google/gemini-3.8-flash",
      LLM_EFFORT: "high",
    });
    expect(overrides.provider).toBe("LLM_MOCK");
    expect(overrides.models.outfits).toBe("LLM_MODEL");
    expect(overrides.models.vision).toBe("LLM_MODEL_VISION");
    expect(overrides.effort).toBe("LLM_EFFORT");
  });
});
