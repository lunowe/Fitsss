import { describe, expect, it } from "vitest";
import {
  derive,
  paletteToBlockColor,
  validateBlockInput,
  type Block,
  type InspoAnalysis,
  type InspoPiece,
} from "@/domain";
import { describePiece, matchInspoToCloset, matchToSlots, similarity, typeScore } from "./match";

const NOW = new Date("2026-09-02T08:00:00.000Z");

function block(id: string, raw: Record<string, unknown>): Block {
  const result = validateBlockInput({ pattern: "solid", quantity: 1, ...raw });
  if (!result.ok) throw new Error(`bad fixture: ${result.errors.join(", ")}`);
  return {
    ...result.value,
    ...derive(result.value),
    id,
    userId: "user-1",
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
  };
}

function piece(raw: Partial<InspoPiece> & Pick<InspoPiece, "category" | "typeId">): InspoPiece {
  return {
    color: paletteToBlockColor("white"),
    pattern: "solid",
    confidence: 0.9,
    ...raw,
  } as InspoPiece;
}

function analysis(pieces: InspoPiece[]): InspoAnalysis {
  return {
    summary: "A look.",
    pieces,
    vibe: ["relaxed"],
    palette: pieces.map((p) => p.color.hex),
    silhouette: "loose top, straight leg",
    formality: 3,
    model: "test",
  };
}

const whiteTee = block("11111111-1111-4111-8111-111111111111", {
  typeId: "t-shirt",
  color: paletteToBlockColor("white"),
  fit: "relaxed",
  material: "cotton",
});
const denimJeans = block("22222222-2222-4222-8222-222222222222", {
  typeId: "jeans",
  color: paletteToBlockColor("denim"),
  fit: "slim",
  material: "denim",
});
const whiteSneakers = block("33333333-3333-4333-8333-333333333333", {
  typeId: "sneakers",
  color: paletteToBlockColor("white"),
  variant: "low-top",
  material: "leather",
});
const blackCap = block("44444444-4444-4444-8444-444444444444", {
  typeId: "cap",
  color: paletteToBlockColor("black"),
  variant: "baseball",
  material: "cotton",
});

const closet = [whiteTee, denimJeans, whiteSneakers, blackCap];

describe("typeScore", () => {
  it("scores identity, family and strangers apart", () => {
    expect(typeScore("t-shirt", "t-shirt")).toBe(1);
    expect(typeScore("t-shirt", "polo")).toBe(0.7);
    expect(typeScore("t-shirt", "puffer")).toBe(0.3);
  });
});

describe("similarity", () => {
  it("gives a perfect score to a piece the person already owns", () => {
    const same = piece({
      category: "top",
      typeId: "t-shirt",
      color: paletteToBlockColor("white"),
      fit: "relaxed",
      material: "cotton",
    });
    expect(similarity(same, whiteTee)).toBeCloseTo(1, 5);
  });
});

describe("matchInspoToCloset", () => {
  it("matches an exact piece", () => {
    const result = matchInspoToCloset(
      analysis([
        piece({
          category: "top",
          typeId: "t-shirt",
          color: paletteToBlockColor("white"),
          fit: "relaxed",
          material: "cotton",
        }),
      ]),
      closet,
    );
    expect(result.matches).toEqual([{ pieceIndex: 0, blockId: whiteTee.id, score: 1 }]);
    expect(result.gaps).toEqual([]);
    expect(result.coverage).toBe(1);
  });

  it("matches across a type family", () => {
    const result = matchInspoToCloset(
      analysis([
        piece({
          category: "top",
          typeId: "long-sleeve-tee",
          color: paletteToBlockColor("white"),
          fit: "relaxed",
          material: "cotton",
        }),
      ]),
      closet,
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].blockId).toBe(whiteTee.id);
    expect(result.matches[0].score).toBeLessThan(1);
  });

  it("never matches across categories", () => {
    const result = matchInspoToCloset(
      analysis([piece({ category: "outerwear", typeId: "puffer", fit: "relaxed" })]),
      closet,
    );
    expect(result.matches).toEqual([]);
    expect(result.gaps).toHaveLength(1);
  });

  it("turns a colour the closet cannot cover into a gap", () => {
    const covered = piece({
      category: "bottom",
      typeId: "chinos",
      color: paletteToBlockColor("denim"),
      fit: "straight",
      material: "twill",
    });
    const uncovered = { ...covered, color: paletteToBlockColor("cream") };

    expect(matchInspoToCloset(analysis([covered]), closet).matches).toHaveLength(1);

    const result = matchInspoToCloset(analysis([uncovered]), closet);
    expect(result.matches).toEqual([]);
    expect(result.gaps).toEqual([
      { pieceIndex: 0, description: "a cream straight chinos" },
    ]);
    expect(result.coverage).toBe(0);
  });

  it("spends each block once, best-confidence piece first", () => {
    const sure = piece({
      category: "top",
      typeId: "t-shirt",
      color: paletteToBlockColor("white"),
      fit: "relaxed",
      material: "cotton",
      confidence: 0.9,
    });
    const lessSure = { ...sure, confidence: 0.5 };

    const result = matchInspoToCloset(analysis([lessSure, sure]), closet);
    // The surer piece (index 1) takes the only white tee.
    expect(result.matches).toEqual([{ pieceIndex: 1, blockId: whiteTee.id, score: 1 }]);
    expect(result.gaps.map((g) => g.pieceIndex)).toEqual([0]);
    expect(result.coverage).toBeCloseTo(0.9 / 1.4, 3);
  });

  it("ignores a piece the model was not sure it saw", () => {
    const result = matchInspoToCloset(
      analysis([piece({ category: "outerwear", typeId: "puffer", confidence: 0.2 })]),
      closet,
    );
    expect(result.matches).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.coverage).toBe(0);
  });

  it("weights coverage by confidence rather than counting pieces", () => {
    const owned = piece({
      category: "footwear",
      typeId: "sneakers",
      color: paletteToBlockColor("white"),
      variant: "low-top",
      material: "leather",
      confidence: 1,
    });
    const missing = piece({
      category: "outerwear",
      typeId: "puffer",
      color: paletteToBlockColor("black"),
      confidence: 0.5,
    });
    const result = matchInspoToCloset(analysis([owned, missing]), closet);
    expect(result.coverage).toBeCloseTo(1 / 1.5, 3);
  });

  it("skips archived blocks", () => {
    const archived = { ...whiteTee, archivedAt: NOW };
    const result = matchInspoToCloset(
      analysis([
        piece({
          category: "top",
          typeId: "t-shirt",
          color: paletteToBlockColor("white"),
          fit: "relaxed",
          material: "cotton",
        }),
      ]),
      [archived],
    );
    expect(result.matches).toEqual([]);
  });
});

describe("describePiece", () => {
  it("reads like something you would go looking for", () => {
    expect(
      describePiece(
        piece({ category: "layer", typeId: "overshirt", color: paletteToBlockColor("beige"), fit: "relaxed" }),
      ),
    ).toBe("a beige relaxed overshirt");
  });

  it("names the pattern and picks the right article", () => {
    expect(
      describePiece(
        piece({
          category: "top",
          typeId: "shirt",
          color: paletteToBlockColor("olive"),
          pattern: "check",
          fit: "oversized",
        }),
      ),
    ).toBe("an olive check oversized shirt");
  });
});

describe("matchToSlots", () => {
  it("arranges matched blocks into outfit slots", () => {
    const pieces = [
      piece({
        category: "top",
        typeId: "t-shirt",
        color: paletteToBlockColor("white"),
        fit: "relaxed",
        material: "cotton",
      }),
      piece({
        category: "bottom",
        typeId: "jeans",
        color: paletteToBlockColor("denim"),
        fit: "slim",
        material: "denim",
      }),
      piece({
        category: "footwear",
        typeId: "sneakers",
        color: paletteToBlockColor("white"),
        variant: "low-top",
        material: "leather",
      }),
      piece({
        category: "accessory",
        typeId: "cap",
        color: paletteToBlockColor("black"),
        variant: "baseball",
        material: "cotton",
      }),
    ];
    const parsed = analysis(pieces);
    const slots = matchToSlots(matchInspoToCloset(parsed, closet), parsed);

    expect(slots).toEqual({
      top: whiteTee.id,
      bottom: denimJeans.id,
      footwear: whiteSneakers.id,
      accessories: [blackCap.id],
    });
  });

  it("returns nothing when nothing matched", () => {
    const parsed = analysis([piece({ category: "outerwear", typeId: "puffer" })]);
    expect(matchToSlots(matchInspoToCloset(parsed, closet), parsed)).toEqual({});
  });
});
