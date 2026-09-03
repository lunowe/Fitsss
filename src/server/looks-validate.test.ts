import { describe, expect, it } from "vitest";

import {
  normalizeWeather,
  unknownBlockIds,
  validateLookName,
  validateOutfitSlots,
  validateSaveLookInput,
} from "./looks-validate";

const TOP = "11111111-1111-4111-8111-111111111111";
const BOTTOM = "22222222-2222-4222-8222-222222222222";
const SHOES = "33333333-3333-4333-8333-333333333333";
const DRESS = "44444444-4444-4444-8444-444444444444";
const CAP = "55555555-5555-4555-8555-555555555555";

describe("validateOutfitSlots", () => {
  it("accepts a top, a bottom and shoes", () => {
    const result = validateOutfitSlots({ top: TOP, bottom: BOTTOM, footwear: SHOES });
    expect(result).toEqual({
      ok: true,
      value: {
        top: TOP,
        layer: undefined,
        outerwear: undefined,
        bottom: BOTTOM,
        fullbody: undefined,
        footwear: SHOES,
        accessories: [],
      },
    });
  });

  it("drops top and bottom when a full-body piece is set", () => {
    const result = validateOutfitSlots({ top: TOP, bottom: BOTTOM, fullbody: DRESS, footwear: SHOES });
    expect(result.ok && result.value.top).toBeUndefined();
    expect(result.ok && result.value.bottom).toBeUndefined();
    expect(result.ok && result.value.fullbody).toBe(DRESS);
  });

  it("requires shoes", () => {
    expect(validateOutfitSlots({ top: TOP, bottom: BOTTOM })).toEqual({
      ok: false,
      errors: ["An outfit needs shoes"],
    });
  });

  it("requires a top and a bottom, or a full-body piece", () => {
    expect(validateOutfitSlots({ top: TOP, footwear: SHOES })).toEqual({
      ok: false,
      errors: ["An outfit needs a top and a bottom, or a full-body piece"],
    });
  });

  it("de-duplicates accessories and ignores non-strings", () => {
    const result = validateOutfitSlots({
      top: TOP,
      bottom: BOTTOM,
      footwear: SHOES,
      accessories: [CAP, CAP, SHOES, 7, null],
    });
    expect(result.ok && result.value.accessories).toEqual([CAP]);
  });
});

describe("validateSaveLookInput", () => {
  it("keeps the outfit copy and the known context fields", () => {
    const result = validateSaveLookInput({
      outfit: {
        id: "gen-1",
        name: "  Easy Monday  ",
        slots: { top: TOP, bottom: BOTTOM, footwear: SHOES },
        why: "  Light layers for a mild day.  ",
        tip: " Roll the cuffs. ",
      },
      styleId: DRESS,
      occasion: "everyday",
      generationId: CAP,
      weather: { tempC: 21, condition: "clear", source: "forecast", place: "Leipzig" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outfit.name).toBe("Easy Monday");
    expect(result.value.outfit.why).toBe("Light layers for a mild day.");
    expect(result.value.outfit.tip).toBe("Roll the cuffs.");
    expect(result.value.styleId).toBe(DRESS);
    expect(result.value.occasion).toBe("everyday");
    expect(result.value.generationId).toBe(CAP);
    expect(result.value.weather?.tempC).toBe(21);
  });

  it("drops unknown occasions and non-uuid ids", () => {
    const result = validateSaveLookInput({
      outfit: { name: "", slots: { top: TOP, bottom: BOTTOM, footwear: SHOES } },
      styleId: "not-a-uuid",
      occasion: "brunch",
      generationId: 12,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outfit.name).toBe("Look");
    expect(result.value.styleId).toBeUndefined();
    expect(result.value.occasion).toBeUndefined();
    expect(result.value.generationId).toBeUndefined();
  });

  it("passes slot errors straight through", () => {
    expect(validateSaveLookInput({ outfit: { slots: { top: TOP } } })).toEqual({
      ok: false,
      errors: ["An outfit needs shoes", "An outfit needs a top and a bottom, or a full-body piece"],
    });
  });
});

describe("normalizeWeather", () => {
  it("returns undefined without a temperature", () => {
    expect(normalizeWeather({ condition: "rain" })).toBeUndefined();
    expect(normalizeWeather(undefined)).toBeUndefined();
  });

  it("falls back to clear and forecast for unknown values", () => {
    expect(normalizeWeather({ tempC: 8, condition: "hail", source: "psychic" })).toMatchObject({
      tempC: 8,
      condition: "clear",
      source: "forecast",
    });
  });
});

describe("validateLookName", () => {
  it("trims and requires a name", () => {
    expect(validateLookName("  Sunday walk ")).toEqual({ ok: true, value: "Sunday walk" });
    expect(validateLookName("   ")).toEqual({ ok: false, errors: ["A look needs a name"] });
    expect(validateLookName("x".repeat(61))).toEqual({
      ok: false,
      errors: ["Keep the name under 60 characters"],
    });
  });
});

describe("unknownBlockIds", () => {
  it("lists the ids the user does not own", () => {
    const slots = {
      top: TOP,
      bottom: BOTTOM,
      footwear: SHOES,
      accessories: [CAP],
    };
    expect(unknownBlockIds(slots, [TOP, BOTTOM, SHOES, CAP])).toEqual([]);
    expect(unknownBlockIds(slots, [TOP, SHOES])).toEqual([BOTTOM, CAP]);
  });
});
