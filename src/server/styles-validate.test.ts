import { describe, expect, it } from "vitest";

import { MAX_ACTIVE_STYLES, STYLE_LIMIT_ERROR, normalizeRules, validateStyleInput } from "./styles-validate";

describe("validateStyleInput", () => {
  it("accepts a filled-in style and trims it", () => {
    const result = validateStyleInput({
      name: "  Clean minimal  ",
      description: "  Neutrals, one dark anchor piece.  ",
      rules: "No logos\n\n  Max one pattern  \n",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        name: "Clean minimal",
        description: "Neutrals, one dark anchor piece.",
        rules: "No logos\nMax one pattern",
      },
    });
  });

  it("requires a name", () => {
    expect(validateStyleInput({ name: "   ", description: "" })).toEqual({
      ok: false,
      errors: ["A style needs a name"],
    });
    expect(validateStyleInput(null)).toEqual({ ok: false, errors: ["A style needs a name"] });
  });

  it("caps the name at 40 characters", () => {
    const result = validateStyleInput({ name: "x".repeat(41), description: "" });
    expect(result).toEqual({ ok: false, errors: ["Keep the name under 40 characters"] });
  });

  it("caps description and rules at 600 characters", () => {
    const result = validateStyleInput({
      name: "Streetwear",
      description: "d".repeat(601),
      rules: "r".repeat(601),
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors).toEqual([
      "Keep the description under 600 characters",
      "Keep the rules under 600 characters",
    ]);
  });

  it("treats blank rules and non-string fields as empty", () => {
    const result = validateStyleInput({ name: "Smart casual", description: 42, rules: "\n \n" });
    expect(result).toEqual({
      ok: true,
      value: { name: "Smart casual", description: "", rules: null },
    });
  });
});

describe("normalizeRules", () => {
  it("drops blank lines and trims each rule", () => {
    expect(normalizeRules(" No logos \n\n Never tuck a tee ")).toBe("No logos\nNever tuck a tee");
  });

  it("returns null when nothing is left", () => {
    expect(normalizeRules("   \n  ")).toBeNull();
    expect(normalizeRules(undefined)).toBeNull();
  });
});

describe("style limit", () => {
  it("states the limit in the error the user sees", () => {
    expect(MAX_ACTIVE_STYLES).toBe(6);
    expect(STYLE_LIMIT_ERROR).toBe("You can keep up to 6 styles");
  });
});
