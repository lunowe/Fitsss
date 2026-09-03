import { describe, expect, it } from "vitest";
import { validateGenerationRequest } from "./generation-request";

const weather = { tempC: 18, condition: "cloudy", source: "forecast" };

function base(overrides: Record<string, unknown> = {}) {
  return { occasion: "everyday", weather, ...overrides };
}

describe("validateGenerationRequest", () => {
  it("accepts a minimal request and fills the defaults", () => {
    const result = validateGenerationRequest(base());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request).toEqual({
      styleId: undefined,
      occasion: "everyday",
      weather: {
        tempC: 18,
        feelsLikeC: undefined,
        lowC: undefined,
        precipitationChance: undefined,
        condition: "cloudy",
        source: "forecast",
        place: undefined,
      },
      steer: undefined,
      count: 3,
      pinned: [],
      excluded: [],
    });
  });

  it("rejects an occasion that is not in the catalog", () => {
    const result = validateGenerationRequest(base({ occasion: "brunch" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Pick an occasion");
  });

  it("rejects a request with no weather", () => {
    const result = validateGenerationRequest({ occasion: "work" });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown weather condition", () => {
    const result = validateGenerationRequest(base({ weather: { ...weather, condition: "hail" } }));
    expect(result.ok).toBe(false);
  });

  it("clamps the count to 1..5 and rounds it", () => {
    const counts = [-4, 0, 1, 3.4, 5, 9, 100];
    const got = counts.map((count) => {
      const result = validateGenerationRequest(base({ count }));
      return result.ok ? result.request.count : null;
    });
    expect(got).toEqual([1, 1, 1, 3, 5, 5, 5]);
  });

  it("falls back to three when the count is not a number", () => {
    const result = validateGenerationRequest(base({ count: "many" }));
    expect(result.ok && result.request.count).toBe(3);
  });

  it("trims the steer to 200 characters", () => {
    const result = validateGenerationRequest(base({ steer: `  ${"a".repeat(400)}  ` }));
    expect(result.ok && result.request.steer?.length).toBe(200);
  });

  it("keeps id lists as unique strings and lets a pin win over an exclusion", () => {
    const result = validateGenerationRequest(
      base({ pinned: ["a", "a", 7, " b "], excluded: ["b", "c", null] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.pinned).toEqual(["a", "b"]);
    expect(result.request.excluded).toEqual(["c"]);
  });

  it("rejects a styleId that is not a uuid", () => {
    const result = validateGenerationRequest(base({ styleId: "nope" }));
    expect(result.ok).toBe(false);
  });

  it("keeps a valid styleId", () => {
    const styleId = "66666666-6666-4666-8666-666666666666";
    const result = validateGenerationRequest(base({ styleId }));
    expect(result.ok && result.request.styleId).toBe(styleId);
  });
});
