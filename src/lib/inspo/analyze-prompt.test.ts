import { describe, expect, it } from "vitest";
import { PALETTE } from "@/domain";
import {
  INSPO_SYSTEM_PROMPT,
  MAX_INSPO_PIECES,
  buildInspoSystem,
  buildVocabulary,
  nearestPaletteId,
  normalizeAnalysis,
} from "./analyze-prompt";

function piece(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    category: "top",
    typeId: "t-shirt",
    colorName: "White",
    colorHex: "#ffffff",
    pattern: "solid",
    confidence: 0.9,
    ...raw,
  };
}

describe("INSPO_SYSTEM_PROMPT", () => {
  it("is frozen and carries the cache breakpoint", () => {
    const system = buildInspoSystem();
    expect(system).toHaveLength(1);
    expect(system[0].text).toBe(INSPO_SYSTEM_PROMPT);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("holds no picture-specific content", () => {
    expect(INSPO_SYSTEM_PROMPT).not.toMatch(/base64|http|\d{4}-\d{2}-\d{2}/);
  });
});

describe("buildVocabulary", () => {
  it("lists type ids with their options and the palette", () => {
    const vocabulary = buildVocabulary();
    expect(vocabulary).toContain("t-shirt · fit: fitted|regular|relaxed|oversized|boxy");
    expect(vocabulary).toContain("sneakers · variant: low-top|high-top|chunky|running|retro|slip-on");
    expect(vocabulary).toContain("navy #1f2a44");
    expect(vocabulary).toContain("(category: footwear)");
  });
});

describe("nearestPaletteId", () => {
  it("claims an exact palette colour", () => {
    expect(nearestPaletteId("#1f2a44")).toBe("navy");
  });

  it("claims a colour a shade off", () => {
    expect(nearestPaletteId("#212c48")).toBe("navy");
  });

  it("leaves a colour that belongs to nobody alone", () => {
    expect(nearestPaletteId("#00ff88")).toBeUndefined();
  });
});

describe("normalizeAnalysis", () => {
  it("keeps a well-formed piece and fills in the derived fields", () => {
    const analysis = normalizeAnalysis(
      {
        pieces: [
          piece({
            colorName: "Navy",
            colorHex: "1F2A44",
            fit: "relaxed",
            material: "cotton",
            pattern: "stripe",
            note: "half-tucked",
          }),
        ],
        summary: "  A relaxed everyday look.  ",
        vibe: ["Relaxed", "relaxed", "  ", "monochrome"],
        palette: ["#1F2A44", "not-a-hex", "#ffffff"],
        silhouette: "loose top, straight leg",
        formality: 2.4,
      },
      "claude-opus-5",
    );

    expect(analysis.pieces).toHaveLength(1);
    const [first] = analysis.pieces;
    expect(first.color).toEqual({
      name: "Navy",
      hex: "#1f2a44",
      family: "blue",
      paletteId: "navy",
    });
    expect(first.fit).toBe("relaxed");
    expect(first.material).toBe("cotton");
    expect(first.pattern).toBe("stripe");
    expect(first.note).toBe("half-tucked");
    expect(analysis.summary).toBe("A relaxed everyday look.");
    expect(analysis.vibe).toEqual(["relaxed", "monochrome"]);
    expect(analysis.palette).toEqual(["#1f2a44", "#ffffff"]);
    expect(analysis.formality).toBe(2);
    expect(analysis.model).toBe("claude-opus-5");
  });

  it("drops a piece whose type id is not in the catalog", () => {
    const analysis = normalizeAnalysis(
      { pieces: [piece({ typeId: "moon-boots" }), piece({ typeId: "jeans", category: "bottom" })] },
      "m",
    );
    expect(analysis.pieces.map((p) => p.typeId)).toEqual(["jeans"]);
  });

  it("drops a piece with an unreadable colour", () => {
    const analysis = normalizeAnalysis({ pieces: [piece({ colorHex: "octarine" })] }, "m");
    expect(analysis.pieces).toEqual([]);
  });

  it("takes the category from the catalog when the model disagrees", () => {
    const analysis = normalizeAnalysis(
      { pieces: [piece({ typeId: "jeans", category: "top" })] },
      "m",
    );
    expect(analysis.pieces[0].category).toBe("bottom");
  });

  it("drops a fit, variant or material the type does not offer", () => {
    const analysis = normalizeAnalysis(
      {
        pieces: [
          piece({ fit: "chelsea", variant: "low-top", material: "leather" }),
          piece({ typeId: "sneakers", category: "footwear", variant: "moon", material: "canvas" }),
        ],
      },
      "m",
    );
    expect(analysis.pieces[0].fit).toBeUndefined();
    expect(analysis.pieces[0].variant).toBeUndefined();
    expect(analysis.pieces[0].material).toBeUndefined();
    expect(analysis.pieces[1].variant).toBeUndefined();
    expect(analysis.pieces[1].material).toBe("canvas");
  });

  it("defaults a pattern the type does not offer back to solid", () => {
    const analysis = normalizeAnalysis({ pieces: [piece({ typeId: "boots", category: "footwear", pattern: "graphic" })] }, "m");
    expect(analysis.pieces[0].pattern).toBe("solid");
  });

  it("clamps confidence and formality", () => {
    const analysis = normalizeAnalysis(
      { pieces: [piece({ confidence: 4 }), piece({ confidence: -2 })], formality: 99 },
      "m",
    );
    expect(analysis.pieces[0].confidence).toBe(1);
    expect(analysis.pieces[1].confidence).toBe(0);
    expect(analysis.formality).toBe(5);
  });

  it("stops at eight pieces", () => {
    const analysis = normalizeAnalysis({ pieces: Array.from({ length: 20 }, () => piece({})) }, "m");
    expect(analysis.pieces).toHaveLength(MAX_INSPO_PIECES);
  });

  it("falls back to the pieces for a palette when the model gave none", () => {
    const navy = PALETTE.find((c) => c.id === "navy")!;
    const analysis = normalizeAnalysis(
      { pieces: [piece({ colorHex: navy.hex })], palette: [] },
      "m",
    );
    expect(analysis.palette).toEqual([navy.hex]);
  });

  it("survives rubbish input", () => {
    const analysis = normalizeAnalysis(null, "m");
    expect(analysis.pieces).toEqual([]);
    expect(analysis.summary).toBe("");
    expect(analysis.formality).toBe(3);
  });
});
