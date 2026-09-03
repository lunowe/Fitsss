import { describe, expect, it } from "vitest";
import { paletteToBlockColor } from "./colors";
import { derive } from "./derive";
import {
  filterClosetForWeather,
  isOccasionId,
  outfitBlockIds,
  validateOutfit,
  warmthBandForTemp,
  type WeatherSnapshot,
} from "./outfit";
import type { Block, BlockInput } from "./types";

let n = 0;
function block(input: Omit<BlockInput, "pattern" | "quantity"> & Partial<BlockInput>): Block {
  const full: BlockInput = { pattern: "solid", quantity: 1, ...input };
  return {
    ...full,
    ...derive(full),
    id: `b${++n}`,
    userId: "u",
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
}

const white = paletteToBlockColor("white");
const black = paletteToBlockColor("black");

const tee = block({ typeId: "t-shirt", color: white, fit: "relaxed", material: "cotton" });
const sweater = block({ typeId: "crewneck-sweater", color: black, fit: "regular", material: "wool" });
const puffer = block({ typeId: "puffer", color: black, fit: "regular", material: "nylon" });
const jeans = block({ typeId: "jeans", color: black, fit: "straight", material: "denim" });
const shorts = block({ typeId: "shorts", color: white, fit: "regular", material: "cotton" });
const sneakers = block({ typeId: "sneakers", color: white, variant: "low-top", material: "leather" });
const sandals = block({ typeId: "sandals", color: black, variant: "slide", material: "leather" });
const boots = block({ typeId: "boots", color: black, variant: "chelsea", material: "leather" });
const beanie = block({ typeId: "beanie", color: black, variant: "cuffed", material: "wool" });
const cap = block({ typeId: "cap", color: black, variant: "dad", material: "cotton" });

const hot: WeatherSnapshot = { tempC: 29, condition: "clear", source: "manual" };
const mild: WeatherSnapshot = { tempC: 16, condition: "cloudy", source: "manual" };
const cold: WeatherSnapshot = { tempC: 1, condition: "snow", source: "manual" };

describe("warmthBandForTemp", () => {
  it("maps temperatures to bands", () => {
    expect(warmthBandForTemp(30)).toEqual([1, 1]);
    expect(warmthBandForTemp(22)).toEqual([1, 2]);
    expect(warmthBandForTemp(16)).toEqual([2, 3]);
    expect(warmthBandForTemp(10)).toEqual([3, 4]);
    expect(warmthBandForTemp(4)).toEqual([4, 5]);
    expect(warmthBandForTemp(-3)).toEqual([5, 5]);
  });
});

describe("filterClosetForWeather", () => {
  const closet = [tee, sweater, puffer, jeans, shorts, sneakers, sandals, boots, beanie, cap];

  it("drops winter pieces in a heatwave and keeps shorts and sandals", () => {
    const r = filterClosetForWeather(closet, hot);
    const ids = new Set(r.wearable.map((b) => b.id));
    expect(ids.has(puffer.id)).toBe(false);
    expect(ids.has(sweater.id)).toBe(false);
    expect(ids.has(beanie.id)).toBe(false);
    expect(ids.has(boots.id)).toBe(false);
    expect(ids.has(shorts.id)).toBe(true);
    expect(ids.has(sandals.id)).toBe(true);
    expect(r.outerwear).toBe("none");
    expect(r.layer).toBe("none");
  });

  it("requires outerwear and drops shorts and sandals in the cold", () => {
    const r = filterClosetForWeather(closet, cold);
    const ids = new Set(r.wearable.map((b) => b.id));
    expect(ids.has(puffer.id)).toBe(true);
    expect(ids.has(shorts.id)).toBe(false);
    expect(ids.has(sandals.id)).toBe(false);
    expect(ids.has(beanie.id)).toBe(true);
    expect(ids.has(tee.id)).toBe(true);
    expect(r.outerwear).toBe("required");
    expect(r.layer).toBe("suggested");
  });

  it("makes outerwear optional on a mild day and drops the puffer", () => {
    const r = filterClosetForWeather(closet, mild);
    const ids = new Set(r.wearable.map((b) => b.id));
    expect(r.outerwear).toBe("optional");
    expect(ids.has(puffer.id)).toBe(false);
    expect(ids.has(sweater.id)).toBe(true);
    expect(ids.has(shorts.id)).toBe(false);
  });

  it("drops sandals when rain is likely", () => {
    const r = filterClosetForWeather(closet, { tempC: 26, condition: "rain", source: "manual" });
    expect(r.wearable.some((b) => b.id === sandals.id)).toBe(false);
    expect(r.notes[0]).toMatch(/Rain/);
  });
});

describe("validateOutfit", () => {
  const candidates = new Map([tee, jeans, sneakers, sweater, cap].map((b) => [b.id, b]));

  it("accepts a complete outfit and keeps accessories", () => {
    const r = validateOutfit(
      { name: "Clean", slots: { top: tee.id, bottom: jeans.id, footwear: sneakers.id, accessories: [cap.id, "nope"] }, why: "Works." },
      candidates,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.outfit.slots.accessories).toEqual([cap.id]);
      expect(outfitBlockIds(r.outfit.slots)).toEqual([tee.id, jeans.id, sneakers.id, cap.id]);
    }
  });

  it("rejects a slot filled with the wrong category", () => {
    const r = validateOutfit({ slots: { top: jeans.id, bottom: jeans.id, footwear: sneakers.id } }, candidates);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/top: .* is a bottom/);
  });

  it("requires footwear and a pinned block", () => {
    const r = validateOutfit({ slots: { top: tee.id, bottom: jeans.id } }, candidates, [sweater.id]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("footwear is required");
      expect(r.errors.some((e) => e.startsWith("pinned block"))).toBe(true);
    }
  });
});

describe("occasions", () => {
  it("recognises ids", () => {
    expect(isOccasionId("work")).toBe(true);
    expect(isOccasionId("wedding")).toBe(false);
  });
});
