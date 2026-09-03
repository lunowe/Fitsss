import { describe, expect, it } from "vitest";
import { derive, paletteToBlockColor, validateBlockInput, type Block } from "@/domain";
import { matchInspoToCloset } from "./match";
import { buildMockAnalysis, perturbColor } from "./mock";

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

const closet = [
  block("11111111-1111-4111-8111-111111111111", {
    typeId: "t-shirt",
    color: paletteToBlockColor("white"),
    fit: "relaxed",
    material: "cotton",
  }),
  block("22222222-2222-4222-8222-222222222222", {
    typeId: "jeans",
    color: paletteToBlockColor("denim"),
    fit: "slim",
    material: "denim",
  }),
  block("33333333-3333-4333-8333-333333333333", {
    typeId: "sneakers",
    color: paletteToBlockColor("white"),
    variant: "low-top",
    material: "leather",
  }),
  block("44444444-4444-4444-8444-444444444444", {
    typeId: "hoodie",
    color: paletteToBlockColor("grey"),
    fit: "oversized",
    material: "cotton",
  }),
];

describe("perturbColor", () => {
  it("lands on a palette colour that is clearly a different colour", () => {
    const shifted = perturbColor(paletteToBlockColor("white"));
    expect(shifted.paletteId).toBeDefined();
    expect(shifted.hex).not.toBe("#ffffff");
  });
});

describe("buildMockAnalysis", () => {
  it("reads a look back out of the closet, one piece per category", () => {
    const analysis = buildMockAnalysis(closet);
    expect(analysis.model).toBe("mock");
    expect(analysis.pieces.length).toBeGreaterThanOrEqual(3);
    expect(new Set(analysis.pieces.map((p) => p.category)).size).toBe(analysis.pieces.length);
    expect(analysis.summary).not.toBe("");
    expect(analysis.palette.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(buildMockAnalysis(closet)).toEqual(buildMockAnalysis([...closet].reverse()));
  });

  it("always leaves at least one gap so the gaps path is exercised", () => {
    const match = matchInspoToCloset(buildMockAnalysis(closet), closet);
    expect(match.gaps.length).toBeGreaterThan(0);
    expect(match.matches.length).toBeGreaterThan(0);
    expect(match.coverage).toBeGreaterThan(0);
    expect(match.coverage).toBeLessThan(1);
  });

  it("copes with an empty closet", () => {
    const analysis = buildMockAnalysis([]);
    expect(analysis.pieces).toEqual([]);
    expect(analysis.model).toBe("mock");
  });
});
