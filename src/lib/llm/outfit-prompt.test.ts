import { describe, expect, it } from "vitest";
import {
  derive,
  filterClosetForWeather,
  paletteToBlockColor,
  validateBlockInput,
  validateOutfit,
  type Block,
  type GenerationRequest,
  type WeatherSnapshot,
} from "@/domain";
import {
  OUTFIT_SYSTEM_PROMPT,
  buildOutfitPrompt,
  buildShortIds,
  resolveOutfit,
} from "./outfit-prompt";

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

const tee = block("11111111-1111-4111-8111-111111111111", {
  typeId: "t-shirt",
  color: paletteToBlockColor("white"),
  fit: "relaxed",
  material: "cotton",
});
const jeans = block("22222222-2222-4222-8222-222222222222", {
  typeId: "jeans",
  color: paletteToBlockColor("denim"),
  fit: "straight",
  material: "denim",
});
const sneakers = block("33333333-3333-4333-8333-333333333333", {
  typeId: "sneakers",
  color: paletteToBlockColor("white"),
  variant: "low-top",
  material: "leather",
});
const overshirt = block("44444444-4444-4444-8444-444444444444", {
  typeId: "overshirt",
  color: paletteToBlockColor("olive"),
  fit: "relaxed",
  material: "twill",
});
const cap = block("55555555-5555-4555-8555-555555555555", {
  typeId: "cap",
  color: paletteToBlockColor("black"),
  variant: "baseball",
  material: "cotton",
});

const candidates = [cap, jeans, sneakers, tee, overshirt];

const weather: WeatherSnapshot = {
  tempC: 18,
  feelsLikeC: 17,
  lowC: 11,
  precipitationChance: 20,
  condition: "cloudy",
  source: "forecast",
  place: "Leipzig",
};

const request: GenerationRequest = {
  occasion: "everyday",
  weather,
  count: 3,
  pinned: [],
  excluded: [],
};

function build(overrides: Partial<Parameters<typeof buildOutfitPrompt>[0]> = {}) {
  return buildOutfitPrompt({
    candidates,
    request,
    style: null,
    weatherContext: filterClosetForWeather(candidates, weather),
    ...overrides,
  });
}

describe("buildShortIds", () => {
  it("gives every candidate exactly one short id, keyed by category", () => {
    const index = buildShortIds(candidates);
    expect(index.entries).toHaveLength(candidates.length);
    expect(index.entries.map((e) => e.shortId).sort()).toEqual(["a1", "b1", "f1", "l1", "t1"]);
  });

  it("round-trips short ids back to block ids", () => {
    const index = buildShortIds(candidates);
    for (const { shortId, block: candidate } of index.entries) {
      expect(index.toReal.get(shortId)).toBe(candidate.id);
      expect(index.toShort.get(candidate.id)).toBe(shortId);
    }
    expect(index.toReal.size).toBe(candidates.length);
    expect(index.toShort.size).toBe(candidates.length);
  });

  it("is order independent", () => {
    const a = buildShortIds(candidates);
    const b = buildShortIds([...candidates].reverse());
    expect(b.entries.map((e) => [e.shortId, e.block.id])).toEqual(
      a.entries.map((e) => [e.shortId, e.block.id]),
    );
  });
});

describe("buildOutfitPrompt system prompt", () => {
  it("is byte identical across calls with different inputs, so the cache hits", () => {
    const first = build();
    const second = build({
      candidates: [tee, jeans, sneakers],
      request: { ...request, occasion: "work", count: 1, steer: "keep it quiet" },
      style: { name: "Clean minimal", description: "Few colours", rules: "no logos" },
    });

    expect(first.system).toHaveLength(1);
    expect(first.system[0].text).toBe(second.system[0].text);
    expect(first.system[0].text).toBe(OUTFIT_SYSTEM_PROMPT);
    expect(first.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("carries no request-specific text", () => {
    expect(OUTFIT_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(OUTFIT_SYSTEM_PROMPT).not.toMatch(/Leipzig/);
  });
});

describe("buildOutfitPrompt user message", () => {
  it("lists every candidate exactly once with its label and ratings", () => {
    const { user, index } = build();
    for (const { shortId, block: candidate } of index.entries) {
      const line = `${shortId} · ${candidate.label}`;
      const occurrences = user.split(line).length - 1;
      expect(occurrences, `${shortId} appears ${occurrences} times`).toBe(1);
    }
    expect(user).toContain(`warmth ${tee.warmth}/5 · formality ${tee.formality}/5`);
  });

  it("states the weather, the guidance and the occasion band", () => {
    const { user } = build();
    expect(user).toContain("18° cloudy");
    expect(user).toContain("feels like 17°");
    expect(user).toContain("20% chance of precipitation");
    expect(user).toContain("in Leipzig");
    expect(user).toContain("Outerwear: optional. Layer: optional.");
    expect(user).toContain("Target formality 1–3 of 5.");
  });

  it("includes style, steer and pins", () => {
    const { user } = build({
      request: { ...request, steer: "wear the new boots", pinned: [overshirt.id], excluded: ["x"] },
      style: { name: "Clean minimal", description: "Few colours, good fabric", rules: "no logos" },
    });
    expect(user).toContain("Clean minimal");
    expect(user).toContain("Few colours, good fabric");
    expect(user).toContain("no logos");
    expect(user).toContain("wear the new boots");
    expect(user).toContain("Every outfit has to use: l1.");
    expect(user).toContain("MUST NOT USE");
    expect(user).toContain("Compose 3 outfits");
  });

  it("appends a correction on a retry", () => {
    const { user } = build({ correction: "you used an id that does not exist" });
    expect(user).toContain("CORRECTION\nyou used an id that does not exist");
  });
});

describe("resolveOutfit", () => {
  it("maps short ids back to real block ids", () => {
    const { index } = build();
    const resolved = resolveOutfit(
      {
        name: "Quiet weekday",
        top: "t1",
        bottom: "b1",
        footwear: "f1",
        accessories: ["a1"],
        why: "Cool enough for the overshirt.",
      },
      index,
    );

    expect(resolved.slots).toMatchObject({
      top: tee.id,
      bottom: jeans.id,
      footwear: sneakers.id,
      accessories: [cap.id],
    });

    const validated = validateOutfit(resolved, new Map(candidates.map((b) => [b.id, b])));
    expect(validated.ok).toBe(true);
  });

  it("drops an outfit that references an id outside the candidates", () => {
    const { index } = build();
    const resolved = resolveOutfit(
      { name: "Invented", top: "t1", bottom: "b1", footwear: "f9", accessories: [], why: "" },
      index,
    );

    expect(resolved.slots.footwear).toBe("f9");

    const validated = validateOutfit(resolved, new Map(candidates.map((b) => [b.id, b])));
    expect(validated.ok).toBe(false);
    if (validated.ok) return;
    expect(validated.errors.join(" ")).toContain("unknown block f9");
  });

  it("rejects an outfit that leaves out a pinned piece", () => {
    const { index } = build();
    const resolved = resolveOutfit(
      { name: "No pin", top: "t1", bottom: "b1", footwear: "f1", accessories: [], why: "" },
      index,
    );

    const validated = validateOutfit(resolved, new Map(candidates.map((b) => [b.id, b])), [
      overshirt.id,
    ]);
    expect(validated.ok).toBe(false);
  });
});
