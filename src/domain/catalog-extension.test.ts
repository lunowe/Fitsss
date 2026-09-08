import { afterEach, describe, expect, it } from "vitest";

import {
  applyCatalogExtension,
  artOverrideKey,
  categoryIdOf,
  clearCatalogExtension,
  getArtOverride,
  getCatalogCategory,
  getPieceType,
  listCategories,
  pieceTypesFor,
  pieceTypesForCategoryId,
} from "./catalog";
import {
  pieceTypeFromCustom,
  slugify,
  suggestedOptionsForRole,
  validateCustomCategory,
  validateCustomPieceType,
  type CatalogExtension,
} from "./catalog-extension";
import { derive } from "./derive";
import { CATEGORIES } from "./types";
import { validateBlockInput } from "./validate";

const jewelry = { id: "jewelry", label: "Jewelry", hint: "Chains, rings", role: "accessory" as const, sortOrder: 0 };

const kimono = pieceTypeFromCustom({
  slug: "kimono",
  categoryId: "top",
  role: "top",
  label: "Kimono",
  plural: "Kimonos",
  fitOptions: ["relaxed", "oversized"],
  variantOptions: [],
  materialOptions: ["cotton", "linen", "silk"],
  patternOptions: ["solid", "print"],
  suggestedColors: ["beige", "black"],
  defaultWeight: "light",
  baseWarmth: 1.5,
  baseFormality: 3,
});

const necklace = pieceTypeFromCustom({
  slug: "necklace",
  categoryId: "jewelry",
  role: "accessory",
  label: "Necklace",
  plural: "Necklaces",
  fitOptions: [],
  variantOptions: ["chain", "pendant"],
  materialOptions: ["metal"],
  patternOptions: ["solid"],
  suggestedColors: [],
  defaultWeight: "light",
  baseWarmth: 0,
  baseFormality: 3,
});

const extension: CatalogExtension = {
  categories: [jewelry],
  types: [kimono, necklace],
  art: { kimono: { viewBox: "0 0 10 10", body: "<path d=\"M0 0h10v10H0Z\"/>" } },
};

afterEach(() => clearCatalogExtension());

describe("applyCatalogExtension", () => {
  it("adds custom types to the same registry the built-ins live in", () => {
    expect(getPieceType("kimono")).toBeUndefined();
    applyCatalogExtension(extension);

    const type = getPieceType("kimono");
    expect(type?.label).toBe("Kimono");
    expect(type?.category).toBe("top");
    expect(type?.custom).toBe(true);
    // built-ins keep working
    expect(getPieceType("t-shirt")?.label).toBe("T-shirt");
  });

  it("clears back to the built-in catalog", () => {
    applyCatalogExtension(extension);
    clearCatalogExtension();
    expect(getPieceType("kimono")).toBeUndefined();
    expect(listCategories()).toHaveLength(CATEGORIES.length);
    expect(getArtOverride("kimono")).toBeUndefined();
  });

  it("never lets a custom entry shadow a built-in one", () => {
    applyCatalogExtension({
      categories: [{ ...jewelry, id: "top", label: "Not tops" }],
      types: [{ ...kimono, id: "t-shirt", label: "Not a t-shirt" }],
    });

    expect(getPieceType("t-shirt")?.label).toBe("T-shirt");
    expect(getCatalogCategory("top")?.label).toBe("Tops");
    expect(listCategories().filter((c) => c.custom)).toHaveLength(0);
  });

  it("orders categories: built-ins first, then custom by sort order", () => {
    applyCatalogExtension({
      categories: [
        { ...jewelry, id: "bags", label: "Bags", sortOrder: 1 },
        jewelry,
      ],
      types: [],
    });

    const custom = listCategories().filter((c) => c.custom).map((c) => c.id);
    expect(listCategories().slice(0, CATEGORIES.length).map((c) => c.id)).toEqual([...CATEGORIES]);
    expect(custom).toEqual(["jewelry", "bags"]);
  });
});

describe("lookups", () => {
  it("files a type under its categoryId but keeps its role", () => {
    applyCatalogExtension(extension);

    expect(categoryIdOf(necklace)).toBe("jewelry");
    expect(pieceTypesForCategoryId("jewelry").map((t) => t.id)).toEqual(["necklace"]);
    // role-based lookup still finds it among the accessories
    expect(pieceTypesFor("accessory").map((t) => t.id)).toContain("necklace");
    expect(pieceTypesForCategoryId("top").map((t) => t.id)).toContain("kimono");
  });

  it("prefers a variant-specific art override over the type-wide one", () => {
    applyCatalogExtension({
      categories: [],
      types: [],
      art: {
        [artOverrideKey("boots")]: { viewBox: "0 0 1 1", body: "<path d=\"M0 0\"/>" },
        [artOverrideKey("boots", "chelsea")]: { viewBox: "0 0 2 2", body: "<path d=\"M1 1\"/>" },
      },
    });

    expect(getArtOverride("boots")?.viewBox).toBe("0 0 1 1");
    expect(getArtOverride("boots", "chelsea")?.viewBox).toBe("0 0 2 2");
    expect(getArtOverride("boots", "work")?.viewBox).toBe("0 0 1 1");
  });
});

describe("custom types behave like built-in ones", () => {
  it("validates and derives a block of a custom type", () => {
    applyCatalogExtension(extension);

    const result = validateBlockInput({
      typeId: "kimono",
      color: { name: "Beige", hex: "#d8c6ae", family: "brown", paletteId: "beige" },
      fit: "relaxed",
      material: "linen",
      pattern: "solid",
      quantity: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const derived = derive(result.value);
    expect(derived.category).toBe("top");
    expect(derived.label).toBe("beige relaxed linen kimono");
    expect(derived.warmth).toBeGreaterThan(0);
  });

  it("rejects a fit the custom type does not offer", () => {
    applyCatalogExtension(extension);
    const result = validateBlockInput({
      typeId: "kimono",
      color: { name: "Beige", hex: "#d8c6ae", family: "brown" },
      fit: "skinny",
      pattern: "solid",
      quantity: 1,
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateCustomCategory", () => {
  it("slugifies the label and keeps the role", () => {
    const result = validateCustomCategory({ label: "Fine jewelry", hint: "Chains", role: "accessory" });
    expect(result).toEqual({
      ok: true,
      value: { slug: "fine-jewelry", label: "Fine jewelry", hint: "Chains", role: "accessory" },
    });
  });

  it("refuses built-in ids, duplicates and missing roles", () => {
    expect(validateCustomCategory({ label: "Top", role: "top" }).ok).toBe(false);
    expect(validateCustomCategory({ label: "Jewelry", role: "accessory" }, ["jewelry"]).ok).toBe(false);
    expect(validateCustomCategory({ label: "Jewelry", role: "nope" }).ok).toBe(false);
    expect(validateCustomCategory({ label: "", role: "accessory" }).ok).toBe(false);
  });
});

describe("validateCustomPieceType", () => {
  const base = {
    label: "Kimono",
    plural: "Kimonos",
    role: "top",
    categoryId: "top",
    fitOptions: ["relaxed", "oversized"],
    materialOptions: ["cotton", "linen", "silk"],
    patternOptions: ["print"],
    suggestedColors: ["beige"],
    defaultWeight: "light",
    baseWarmth: 1.5,
    baseFormality: 3,
  };

  it("accepts a garment described by fits and always allows solid", () => {
    const result = validateCustomPieceType(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slug).toBe("kimono");
    expect(result.value.patternOptions).toEqual(["solid", "print"]);
    expect(result.value.variantOptions).toEqual([]);
  });

  it("enforces fits for garment roles and variants for the rest", () => {
    expect(validateCustomPieceType({ ...base, fitOptions: [] }).ok).toBe(false);
    expect(
      validateCustomPieceType({ ...base, role: "accessory", categoryId: "jewelry" }).ok,
    ).toBe(false);
    expect(
      validateCustomPieceType({
        ...base,
        role: "accessory",
        categoryId: "jewelry",
        fitOptions: [],
        variantOptions: ["chain"],
      }).ok,
    ).toBe(true);
  });

  it("refuses collisions with built-in types and with the user's own", () => {
    expect(validateCustomPieceType({ ...base, label: "T-shirt" }).ok).toBe(false);
    expect(validateCustomPieceType(base, ["kimono"]).ok).toBe(false);
  });

  it("keeps warmth and formality on half steps inside 0 to 5", () => {
    expect(validateCustomPieceType({ ...base, baseWarmth: 1.25 }).ok).toBe(false);
    expect(validateCustomPieceType({ ...base, baseFormality: 6 }).ok).toBe(false);
    expect(validateCustomPieceType({ ...base, baseWarmth: 0, baseFormality: 5 }).ok).toBe(true);
  });

  it("drops unknown materials, patterns and palette ids", () => {
    const result = validateCustomPieceType({
      ...base,
      materialOptions: ["cotton", "unobtainium"],
      patternOptions: ["print", "hologram"],
      suggestedColors: ["beige", "not-a-colour"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.materialOptions).toEqual(["cotton"]);
    expect(result.value.patternOptions).toEqual(["solid", "print"]);
    expect(result.value.suggestedColors).toEqual(["beige"]);
  });

  it("needs at least one material and a usable option name", () => {
    expect(validateCustomPieceType({ ...base, materialOptions: [] }).ok).toBe(false);
    expect(validateCustomPieceType({ ...base, fitOptions: ["way too loose"] }).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("slugifies labels", () => {
    expect(slugify("Fine Jewelry")).toBe("fine-jewelry");
    expect(slugify("Rain  Shell")).toBe("rain-shell");
    expect(slugify("Écharpe")).toBe("echarpe");
    expect(slugify("!!!")).toBe("");
  });

  it("suggests the vocabulary a role already uses", () => {
    expect(suggestedOptionsForRole("bottom")).toContain("straight");
    expect(suggestedOptionsForRole("footwear")).toContain("chelsea");
    expect(suggestedOptionsForRole("accessory")).toContain("crossbody");
  });

  it("gives a custom type the neutral glyph of its role", () => {
    expect(kimono.icon).toBe("tee");
    expect(necklace.icon).toBe("bag");
  });
});
