import { describe, expect, it } from "vitest";

import { cleanText, clipText, hasVisibleText } from "./text";
import { validateBlockInput } from "./validate";

const white = { name: "White", hex: "#ffffff", family: "neutral", paletteId: "white" };

describe("clipText", () => {
  it("never leaves half an emoji behind", () => {
    const clipped = clipText(`${"a".repeat(59)}👕👕`, 60);
    expect(Array.from(clipped)).toHaveLength(60);
    expect(clipped.endsWith("👕")).toBe(true);
    expect(clipped.isWellFormed()).toBe(true);
  });

  it("leaves short text alone", () => {
    expect(clipText("Uniqlo U", 60)).toBe("Uniqlo U");
  });
});

describe("validateBlockInput text limits", () => {
  // Regression: a nickname or color name ending in an emoji at the limit used
  // to be cut through the emoji, and the write failed.
  it("clips nickname and color name on character boundaries", () => {
    const result = validateBlockInput({
      typeId: "t-shirt",
      color: { ...white, name: `${"x".repeat(39)}🌈🌈` },
      fit: "regular",
      pattern: "solid",
      quantity: 1,
      nickname: `${"n".repeat(59)}👕👕`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.color.name.isWellFormed()).toBe(true);
    expect(Array.from(result.value.color.name)).toHaveLength(40);
    expect(result.value.nickname?.isWellFormed()).toBe(true);
    expect(Array.from(result.value.nickname ?? "")).toHaveLength(60);
  });
});

describe("cleanText", () => {
  it("drops control characters but keeps line breaks", () => {
    expect(cleanText("a\u0000b\u0007c\nd\te")).toBe("abc\nd\te");
  });

  it("replaces lone surrogates and keeps real pairs", () => {
    expect(cleanText("x\ud800y")).toBe("x\uFFFDy");
    expect(cleanText("x\udc00")).toBe("x\uFFFD");
    expect(cleanText("👕")).toBe("👕");
    expect(cleanText("x\ud800y").isWellFormed()).toBe(true);
  });
});

describe("clipText keeps characters whole", () => {
  it("never splits a flag, a family emoji or a combining accent", () => {
    expect(clipText(`${"a".repeat(199)}🇩🇪`, 200)).toBe("a".repeat(199));
    expect(clipText(`${"a".repeat(198)}👨‍👩‍👧`, 200)).toBe("a".repeat(198));
    expect(clipText(`${"a".repeat(199)}e\u0301`, 200)).toBe("a".repeat(199));
  });
});

describe("hasVisibleText", () => {
  it("sees through invisible characters", () => {
    for (const blank of ["\u200B", "\u200D\u200C", "\u2060", "\u3164", "\u2800", "\u200E", "\u202E", "\u00AD", "\u034F", "\uFE0F", "\u180E", "\u{E0020}", " \t\n"]) {
      expect(hasVisibleText(blank), JSON.stringify(blank)).toBe(false);
    }
    expect(hasVisibleText("Y2K")).toBe(true);
    expect(hasVisibleText("👨‍👩‍👧")).toBe(true);
  });
});
