import { describe, expect, it } from "vitest";
import { CATALOG, getPieceType, isGarment } from "./catalog";
import { PALETTE, familyForHex, paletteToBlockColor } from "./colors";
import { derive } from "./derive";
import { MATERIALS } from "./materials";
import { SILHOUETTE_IDS, type BlockInput } from "./types";
import { validateBlockInput } from "./validate";

const white = paletteToBlockColor("white");
const black = paletteToBlockColor("black");

describe("catalog integrity", () => {
  it("has unique ids and valid references", () => {
    const ids = new Set<string>();
    const materialIds = new Set(MATERIALS.map((m) => m.id));
    const paletteIds = new Set(PALETTE.map((c) => c.id));
    for (const t of CATALOG) {
      expect(ids.has(t.id), `duplicate id ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(SILHOUETTE_IDS).toContain(t.icon);
      expect(t.materialOptions.length).toBeGreaterThan(0);
      for (const m of t.materialOptions) expect(materialIds.has(m), `${t.id} material ${m}`).toBe(true);
      for (const c of t.suggestedColors) expect(paletteIds.has(c), `${t.id} color ${c}`).toBe(true);
      expect(t.patternOptions).toContain("solid");
      const hasFit = t.fitOptions !== undefined;
      const hasVariant = t.variantOptions !== undefined;
      expect(hasFit !== hasVariant, `${t.id} must have exactly one of fitOptions/variantOptions`).toBe(true);
      if (t.category === "footwear" || t.category === "accessory") expect(hasVariant).toBe(true);
      else expect(hasFit).toBe(true);
    }
  });
});

describe("derive", () => {
  it("derives a light summer tee", () => {
    const d = derive({ typeId: "t-shirt", color: white, fit: "relaxed", material: "cotton", pattern: "solid", quantity: 1 });
    expect(d.category).toBe("top");
    expect(d.warmth).toBe(1);
    expect(d.formality).toBe(2);
    expect(d.seasons).toEqual(["spring", "summer"]);
    expect(d.label).toBe("white relaxed cotton t-shirt");
  });

  it("makes a graphic oversized tee less formal", () => {
    const d = derive({ typeId: "t-shirt", color: black, fit: "oversized", pattern: "graphic", quantity: 1 });
    expect(d.formality).toBe(1);
    expect(d.label).toBe("black graphic oversized t-shirt");
  });

  it("labels footwear as color material variant type", () => {
    const d = derive({ typeId: "boots", color: black, variant: "chelsea", material: "leather", pattern: "solid", quantity: 1 });
    expect(d.label).toBe("black leather chelsea boots");
    expect(d.warmth).toBe(4);
    expect(d.seasons).toEqual(["autumn", "winter"]);
  });

  it("does not repeat a variant that names the material", () => {
    const belt = derive({ typeId: "belt", color: black, variant: "leather", material: "leather", pattern: "solid", quantity: 1 });
    expect(belt.label).toBe("black leather belt");
    const scarf = derive({ typeId: "scarf", color: black, variant: "wool-scarf", material: "wool", pattern: "solid", quantity: 1 });
    expect(scarf.label).toBe("black wool scarf");
  });

  it("applies weight override relative to the type default", () => {
    const base: BlockInput = { typeId: "crewneck-sweater", color: black, fit: "regular", material: "wool", pattern: "solid", quantity: 1 };
    expect(derive(base).warmth).toBe(4);
    expect(derive({ ...base, weight: "heavy" }).warmth).toBe(5);
    expect(derive({ ...base, weight: "light" }).warmth).toBe(3);
  });

  it("treats season-neutral accessories as all-season", () => {
    const d = derive({ typeId: "belt", color: black, variant: "leather", material: "leather", pattern: "solid", quantity: 1 });
    expect(d.seasons).toHaveLength(4);
    expect(d.warmth).toBe(1);
  });

  it("clamps to 1..5", () => {
    const d = derive({ typeId: "puffer", color: black, fit: "oversized", material: "nylon", weight: "heavy", pattern: "solid", quantity: 1 });
    expect(d.warmth).toBe(5);
    expect(d.formality).toBe(1);
  });
});

describe("validateBlockInput", () => {
  it("accepts a valid garment", () => {
    const r = validateBlockInput({ typeId: "jeans", color: white, fit: "straight", material: "denim", pattern: "solid", quantity: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.quantity).toBe(2);
  });

  it("rejects a fit outside the type vocabulary", () => {
    const r = validateBlockInput({ typeId: "jeans", color: white, fit: "boxy", pattern: "solid" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^fit/);
  });

  it("requires a variant for footwear and rejects a garment fit there", () => {
    const r = validateBlockInput({ typeId: "sneakers", color: white, fit: "regular", pattern: "solid" });
    expect(r.ok).toBe(false);
    const ok = validateBlockInput({ typeId: "sneakers", color: white, variant: "low-top", pattern: "solid" });
    expect(ok.ok).toBe(true);
  });

  it("rejects materials not allowed for the type", () => {
    const r = validateBlockInput({ typeId: "t-shirt", color: white, fit: "regular", material: "leather", pattern: "solid" });
    expect(r.ok).toBe(false);
  });

  it("normalizes custom hex and trims text", () => {
    const r = validateBlockInput({
      typeId: "hoodie",
      color: { name: "  Dusty rose ", hex: "C48B8F", family: "pink" },
      fit: "oversized",
      pattern: "solid",
      nickname: "  Stüssy  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.color.hex).toBe("#c48b8f");
      expect(r.value.color.name).toBe("Dusty rose");
      expect(r.value.nickname).toBe("Stüssy");
    }
  });

  it("defaults pattern to solid and quantity to 1", () => {
    const r = validateBlockInput({ typeId: "t-shirt", color: white, fit: "regular" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.pattern).toBe("solid");
      expect(r.value.quantity).toBe(1);
    }
  });
});

describe("colors", () => {
  it("classifies hex into families", () => {
    expect(familyForHex("#ffffff")).toBe("neutral");
    expect(familyForHex("#1f2a44")).toBe("blue");
    expect(familyForHex("#6b6b3a")).toBe("green");
    expect(familyForHex("#7a5230")).toBe("brown");
  });
});

describe("garment helper", () => {
  it("distinguishes garments from variant types", () => {
    expect(isGarment(getPieceType("t-shirt")!)).toBe(true);
    expect(isGarment(getPieceType("sneakers")!)).toBe(false);
  });
});
