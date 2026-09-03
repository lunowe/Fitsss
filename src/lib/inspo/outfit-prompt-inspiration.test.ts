import { describe, expect, it } from "vitest";
import {
  derive,
  filterClosetForWeather,
  inspirationForPrompt,
  paletteToBlockColor,
  validateBlockInput,
  type Block,
  type GenerationRequest,
  type InspoAnalysis,
  type WeatherSnapshot,
} from "@/domain";
import { OUTFIT_SYSTEM_PROMPT, buildOutfitPrompt } from "@/lib/llm/outfit-prompt";

/**
 * The two sections work package I adds to the generation prompt. Kept beside
 * the inspiration code rather than in outfit-prompt.test.ts so the feature and
 * its prompt contract move together.
 */

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

const candidates = [
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
];

const weather: WeatherSnapshot = { tempC: 18, condition: "cloudy", source: "manual" };

const request: GenerationRequest = {
  occasion: "everyday",
  weather,
  count: 2,
  pinned: [],
  excluded: [],
};

const analysis: InspoAnalysis = {
  summary: "A washed-out summer look with a boxy tee over wide denim.",
  pieces: [
    {
      category: "top",
      typeId: "t-shirt",
      color: paletteToBlockColor("cream"),
      fit: "boxy",
      material: "cotton",
      pattern: "solid",
      confidence: 0.9,
    },
  ],
  vibe: ["relaxed", "washed"],
  palette: ["#eee5cf", "#4c6d9c"],
  silhouette: "boxy top, wide leg",
  formality: 2,
  model: "test",
};

function build(extra: Partial<Parameters<typeof buildOutfitPrompt>[0]>) {
  return buildOutfitPrompt({
    candidates,
    request,
    style: null,
    weatherContext: filterClosetForWeather(candidates, weather),
    ...extra,
  });
}

describe("inspiration section", () => {
  it("is absent when no picture is being restyled", () => {
    const prompt = build({});
    expect(prompt.user).not.toContain("INSPIRATION");
  });

  it("renders the analysis and the substitution rule", () => {
    const prompt = build({ inspiration: inspirationForPrompt(analysis) });
    expect(prompt.user).toContain("INSPIRATION — restyle this look from the closet");
    expect(prompt.user).toContain("A washed-out summer look with a boxy tee over wide denim.");
    expect(prompt.user).toContain("Silhouette: boxy top, wide leg");
    expect(prompt.user).toContain("cream boxy cotton t shirt");
    expect(prompt.user).toContain("Capture the silhouette and the palette with pieces the person owns");
    expect(prompt.user).toContain("Never claim a piece that is not in the closet");
  });

  it("is skipped when the caller passes an empty string", () => {
    expect(build({ inspiration: "   " }).user).not.toContain("INSPIRATION");
  });
});

describe("style references section", () => {
  it("is absent when the style has no saved pictures", () => {
    expect(build({}).user).not.toContain("REFERENCE LOOKS");
    expect(build({ styleReferences: [] }).user).not.toContain("REFERENCE LOOKS");
    expect(build({ styleReferences: ["  ", ""] }).user).not.toContain("REFERENCE LOOKS");
  });

  it("lists each saved look as a bullet", () => {
    const prompt = build({
      styleReferences: ["A quiet monochrome office look.", "Washed denim with a chore jacket."],
    });
    expect(prompt.user).toContain("REFERENCE LOOKS FOR THIS STYLE");
    expect(prompt.user).toContain("- A quiet monochrome office look.");
    expect(prompt.user).toContain("- Washed denim with a chore jacket.");
  });
});

describe("the system prompt", () => {
  it("does not change when an inspiration is added", () => {
    const plain = build({});
    const inspired = build({
      inspiration: inspirationForPrompt(analysis),
      styleReferences: ["A quiet monochrome office look."],
    });
    expect(inspired.system[0].text).toBe(OUTFIT_SYSTEM_PROMPT);
    expect(inspired.system).toEqual(plain.system);
  });
});
