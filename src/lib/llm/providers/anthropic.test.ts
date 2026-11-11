import { describe, expect, it } from "vitest";

import { toAnthropicModel } from "./anthropic";

describe("toAnthropicModel", () => {
  it("turns OpenRouter ids into Claude API ids", () => {
    expect(toAnthropicModel("anthropic/claude-opus-5.5")).toBe("claude-opus-5-5");
    expect(toAnthropicModel("anthropic/claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(toAnthropicModel("anthropic/claude-haiku-4.5")).toBe("claude-haiku-4-5");
  });

  it("leaves other vendors and bare ids alone", () => {
    expect(toAnthropicModel("openai/gpt-5.6-sol")).toBe("openai/gpt-5.6-sol");
    expect(toAnthropicModel("claude-opus-5-5")).toBe("claude-opus-5-5");
  });
});
