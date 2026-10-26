import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The AI model test spends the server's key. These check the brakes on it
 * without calling a model: one call per user, task and model at a time, and
 * a cap per user, counting only calls that would reach a model.
 */

const state = vi.hoisted(() => ({
  provider: "openrouter" as "openrouter" | "mock",
  model: "openai/gpt-5.6-luna",
  calls: [] as string[],
  release: [] as Array<() => void>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/settings-queries", () => ({
  getLlmSettingsForUser: async () => ({
    provider: state.provider,
    models: { outfits: state.model, taste: state.model, vision: state.model },
    effort: "medium",
  }),
}));
vi.mock("@/lib/llm/provider", () => ({
  providerConfigured: () => ({ ok: true }),
  callStructured: (call: { task: string }, settings: { models: Record<string, string> }) => {
    state.calls.push(settings.models[call.task]);
    return new Promise((resolve) => {
      state.release.push(() =>
        resolve({ ok: true, value: { ok: true, word: "hi" }, model: settings.models[call.task], usage: {} }),
      );
    });
  },
}));

const { TEST_LIMIT, testLlmSettingsForUser } = await import("./settings-core");

function releaseAll() {
  state.release.splice(0).forEach((release) => release());
}

describe("testLlmSettingsForUser", () => {
  beforeEach(() => {
    state.provider = "openrouter";
    state.model = "openai/gpt-5.6-luna";
    state.calls = [];
    state.release = [];
  });

  it("joins a running test of the same model, but not one of a model set since", async () => {
    const first = testLlmSettingsForUser("join", "outfits");
    const again = testLlmSettingsForUser("join", "outfits");
    await vi.waitFor(() => expect(state.calls).toHaveLength(1));
    state.model = "google/gemini-3.8-flash";
    const changed = testLlmSettingsForUser("join", "outfits");
    await vi.waitFor(() => expect(state.calls).toHaveLength(2));
    releaseAll();
    const [a, b, c] = await Promise.all([first, again, changed]);
    expect(a).toEqual(b);
    expect(c).toMatchObject({ ok: true, model: "google/gemini-3.8-flash" });
  });

  it("caps the calls per person, not counting the mock", async () => {
    state.provider = "mock";
    for (let i = 0; i < TEST_LIMIT + 5; i++) {
      expect(await testLlmSettingsForUser("cap", "outfits")).toMatchObject({ code: "not-configured" });
    }
    state.provider = "openrouter";
    for (let i = 0; i < TEST_LIMIT; i++) {
      const result = testLlmSettingsForUser("cap", "taste");
      await vi.waitFor(() => expect(state.calls).toHaveLength(i + 1));
      releaseAll();
      expect(await result).toMatchObject({ ok: true });
    }
    expect(await testLlmSettingsForUser("cap", "taste")).toMatchObject({ ok: false, code: "rate-limited" });
    expect(state.calls).toHaveLength(TEST_LIMIT);
    // Someone else still can.
    const other = testLlmSettingsForUser("someone-else", "taste");
    await vi.waitFor(() => expect(state.calls).toHaveLength(TEST_LIMIT + 1));
    releaseAll();
    expect(await other).toMatchObject({ ok: true });
  });
});
