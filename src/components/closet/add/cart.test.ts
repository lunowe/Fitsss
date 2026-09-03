import { describe, expect, it } from "vitest";
import { paletteToBlockColor } from "@/domain";
import {
  addToCart,
  cartCount,
  cartInputs,
  draftCount,
  expandDraft,
  groupByCategory,
  lineKey,
  parseCart,
  setLineQuantity,
  type Draft,
} from "./cart";

const white = paletteToBlockColor("white");
const black = paletteToBlockColor("black");

const draft = (over: Partial<Draft> = {}): Draft => ({
  typeId: "t-shirt",
  colors: [white, black],
  options: ["regular", "relaxed"],
  materials: [],
  pattern: "solid",
  ...over,
});

describe("expandDraft", () => {
  it("multiplies colors by fits and leaves material unset when none is picked", () => {
    const inputs = expandDraft(draft(), true);

    expect(inputs).toHaveLength(4);
    expect(draftCount(draft())).toBe(4);
    expect(inputs.every((i) => i.material === undefined)).toBe(true);
    expect(inputs.map((i) => `${i.color.name}/${i.fit}`)).toEqual([
      "White/regular",
      "White/relaxed",
      "Black/regular",
      "Black/relaxed",
    ]);
  });

  it("multiplies by materials when some are picked", () => {
    const d = draft({ materials: ["cotton", "linen"] });

    expect(expandDraft(d, true)).toHaveLength(8);
    expect(draftCount(d)).toBe(8);
  });

  it("writes variant instead of fit for footwear and accessories", () => {
    const d = draft({ typeId: "sneakers", colors: [white], options: ["low-top"] });
    const [input] = expandDraft(d, false);

    expect(input.variant).toBe("low-top");
    expect(input.fit).toBeUndefined();
  });

  it("applies nickname, notes and weight to every generated line", () => {
    const inputs = expandDraft(draft({ nickname: "the Uniqlo one", notes: "hem", weight: "mid" }), true);

    expect(inputs.every((i) => i.nickname === "the Uniqlo one" && i.notes === "hem" && i.weight === "mid")).toBe(true);
  });
});

describe("addToCart", () => {
  it("merges identical lines by incrementing quantity", () => {
    const first = addToCart([], expandDraft(draft({ colors: [white], options: ["regular"] }), true));
    const second = addToCart(first, expandDraft(draft({ colors: [white], options: ["regular"] }), true));

    expect(second).toHaveLength(1);
    expect(second[0].quantity).toBe(2);
    expect(cartCount(second)).toBe(2);
  });

  it("keeps lines that differ in any attribute apart", () => {
    const lines = addToCart([], expandDraft(draft({ colors: [white], options: ["regular"] }), true));
    const withMaterial = addToCart(
      lines,
      expandDraft(draft({ colors: [white], options: ["regular"], materials: ["cotton"] }), true),
    );

    expect(withMaterial).toHaveLength(2);
    expect(cartCount(withMaterial)).toBe(2);
  });

  it("does not mutate the lines it was given", () => {
    const lines = addToCart([], expandDraft(draft({ colors: [white], options: ["regular"] }), true));
    addToCart(lines, expandDraft(draft({ colors: [white], options: ["regular"] }), true));

    expect(lines[0].quantity).toBe(1);
  });
});

describe("setLineQuantity", () => {
  const lines = addToCart([], expandDraft(draft(), true));

  it("updates one line", () => {
    expect(setLineQuantity(lines, lines[1].key, 4)[1].quantity).toBe(4);
  });

  it("removes the line when the quantity drops below one", () => {
    const next = setLineQuantity(lines, lines[0].key, 0);

    expect(next).toHaveLength(3);
    expect(next.some((l) => l.key === lines[0].key)).toBe(false);
  });
});

describe("cartInputs", () => {
  it("folds the quantity back into each BlockInput", () => {
    const lines = setLineQuantity(addToCart([], expandDraft(draft({ colors: [white], options: ["regular"] }), true)), lineKey({ typeId: "t-shirt", color: white, fit: "regular", pattern: "solid" }), 3);

    expect(cartInputs(lines)).toEqual([{ typeId: "t-shirt", color: white, fit: "regular", pattern: "solid", quantity: 3 }]);
  });
});

describe("groupByCategory", () => {
  it("buckets lines by their catalog category in cart order", () => {
    const lines = addToCart(
      addToCart([], expandDraft(draft({ colors: [white], options: ["regular"] }), true)),
      expandDraft(draft({ typeId: "sneakers", colors: [black], options: ["low-top"] }), false),
    );

    expect(groupByCategory(lines).map((g) => g.category)).toEqual(["top", "footwear"]);
  });
});

describe("parseCart", () => {
  it("restores valid lines and recomputes their keys", () => {
    const restored = parseCart([
      { input: { typeId: "t-shirt", color: white, fit: "regular", pattern: "solid" }, quantity: 2 },
    ]);

    expect(restored).toHaveLength(1);
    expect(restored[0].key).toBe(lineKey({ typeId: "t-shirt", color: white, fit: "regular", pattern: "solid" }));
    expect(restored[0].quantity).toBe(2);
  });

  it("drops unknown types, broken colors, bad quantities and non-arrays", () => {
    expect(parseCart("nope")).toEqual([]);
    expect(
      parseCart([
        { input: { typeId: "flux-capacitor", color: white, pattern: "solid" }, quantity: 1 },
        { input: { typeId: "t-shirt", color: { name: "X" }, pattern: "solid" }, quantity: 1 },
        { input: { typeId: "t-shirt", color: white, pattern: "solid" }, quantity: 0 },
        null,
      ]),
    ).toEqual([]);
  });
});
