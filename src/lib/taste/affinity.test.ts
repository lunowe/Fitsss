import { describe, expect, it } from "vitest";
import type { Block, Outfit, OutfitSlots } from "@/domain";
import {
  affinitySummaryLines,
  computeAffinity,
  pairAffinity,
  recencyWeight,
  topFavorites,
  topSkipped,
} from "./affinity";
import type { OutfitEventLike } from "./types";

const NOW = new Date("2026-09-02T12:00:00.000Z");

const TEE = "tee";
const JEANS = "jeans";
const SNEAKERS = "sneakers";
const SWEATER = "sweater";

function slots(over: Partial<OutfitSlots> = {}): OutfitSlots {
  return { top: TEE, bottom: JEANS, footwear: SNEAKERS, accessories: [], ...over };
}

function outfit(over: Partial<OutfitSlots> = {}): Outfit {
  return { id: "o1", name: "Look", slots: slots(over), why: "" };
}

function event(over: Partial<OutfitEventLike> & { type: string }): OutfitEventLike {
  return { outfit: outfit(), createdAt: NOW, ...over };
}

function scoreOf(events: OutfitEventLike[], blockId: string, styleId?: string | null): number {
  const aff = computeAffinity(events, { now: NOW, styleId });
  return aff.get(blockId)?.score ?? 0;
}

/** Labels come from real blocks in the app; only id and label are read. */
const labels = [
  { id: TEE, label: "white relaxed cotton t-shirt" },
  { id: JEANS, label: "denim blue straight jeans" },
  { id: SNEAKERS, label: "white leather low-top sneakers" },
  { id: SWEATER, label: "navy wool crewneck sweater" },
] as unknown as Block[];

describe("computeAffinity", () => {
  it("scores each event type over every piece in the outfit", () => {
    expect(scoreOf([event({ type: "saved" })], TEE)).toBe(2);
    expect(scoreOf([event({ type: "worn" })], TEE)).toBe(3);
    expect(scoreOf([event({ type: "liked" })], TEE)).toBe(1);
    expect(scoreOf([event({ type: "unsaved" })], TEE)).toBe(-1);
    expect(scoreOf([event({ type: "disliked" })], TEE)).toBe(-2);
    expect(scoreOf([event({ type: "disliked", reason: "colors" })], SNEAKERS)).toBe(-2);
  });

  it("softens dislikes that are not about the pieces", () => {
    expect(scoreOf([event({ type: "disliked", reason: "wrong-piece" })], TEE)).toBe(-1);
    for (const reason of ["too-warm", "too-cold", "too-dressy", "too-casual"]) {
      expect(scoreOf([event({ type: "disliked", reason })], JEANS)).toBe(-1);
    }
  });

  it("only touches the two blocks in a swap", () => {
    const aff = computeAffinity(
      [event({ type: "swapped", detail: { slot: "top", fromId: TEE, toId: SWEATER } })],
      { now: NOW },
    );
    expect(aff.get(TEE)?.score).toBe(-1.5);
    expect(aff.get(TEE)?.swapsOut).toBe(1);
    expect(aff.get(SWEATER)?.score).toBe(1);
    expect(aff.get(SWEATER)?.swapsIn).toBe(1);
    expect(aff.get(JEANS)).toBeUndefined();
    expect(aff.get(SNEAKERS)).toBeUndefined();
  });

  it("ignores event types it does not know", () => {
    expect(computeAffinity([event({ type: "shrugged" })], { now: NOW }).size).toBe(0);
  });

  it("counts raw events next to the decayed score", () => {
    const aff = computeAffinity(
      [
        event({ type: "worn", createdAt: new Date("2026-08-01T12:00:00.000Z") }),
        event({ type: "saved" }),
        event({ type: "saved" }),
        event({ type: "disliked", reason: "colors" }),
      ],
      { now: NOW },
    );
    const tee = aff.get(TEE)!;
    expect({ saves: tee.saves, wears: tee.wears, likes: tee.likes, dislikes: tee.dislikes }).toEqual({
      saves: 2,
      wears: 1,
      likes: 0,
      dislikes: 1,
    });
  });
});

describe("recency decay", () => {
  it("halves every 90 days", () => {
    const ninety = new Date(NOW.getTime() - 90 * 86_400_000);
    expect(recencyWeight(ninety, NOW.getTime())).toBeCloseTo(0.5, 10);
    const oneEighty = new Date(NOW.getTime() - 180 * 86_400_000);
    expect(recencyWeight(oneEighty, NOW.getTime())).toBeCloseTo(0.25, 10);
  });

  it("does not amplify a timestamp from the future", () => {
    expect(recencyWeight(new Date(NOW.getTime() + 86_400_000), NOW.getTime())).toBe(1);
  });

  it("applies the decay to the score", () => {
    const ninety = new Date(NOW.getTime() - 90 * 86_400_000);
    expect(scoreOf([event({ type: "worn", createdAt: ninety })], TEE)).toBe(1.5);
  });
});

describe("style weighting", () => {
  const events = [
    event({ type: "worn", styleId: "style-a" }),
    event({ type: "worn", styleId: "style-b" }),
  ];

  it("counts every style at full weight for the overall profile", () => {
    expect(scoreOf(events, TEE)).toBe(6);
    expect(scoreOf(events, TEE, null)).toBe(6);
  });

  it("weights other styles at 0.3 for a style profile", () => {
    expect(scoreOf(events, TEE, "style-a")).toBe(3.9);
  });

  it("treats an event with no style as another style", () => {
    expect(scoreOf([event({ type: "worn" })], TEE, "style-a")).toBe(0.9);
  });
});

describe("pairAffinity", () => {
  it("scores (top, bottom) pairs and ignores swaps", () => {
    const pairs = pairAffinity(
      [
        event({ type: "worn" }),
        event({ type: "saved" }),
        event({ type: "swapped", detail: { slot: "top", fromId: TEE, toId: SWEATER } }),
      ],
      { now: NOW },
    );
    expect(pairs.get(`${TEE}+${JEANS}`)).toEqual({
      topId: TEE,
      bottomId: JEANS,
      score: 5,
      count: 2,
    });
    expect(pairs.size).toBe(1);
  });

  it("skips outfits without both halves", () => {
    const pairs = pairAffinity([event({ type: "worn", outfit: outfit({ top: undefined }) })], {
      now: NOW,
    });
    expect(pairs.size).toBe(0);
  });
});

describe("affinitySummaryLines", () => {
  const events = [
    event({ type: "worn" }),
    event({ type: "worn" }),
    event({ type: "worn" }),
    event({ type: "saved" }),
    event({ type: "saved" }),
    event({
      type: "disliked",
      reason: "colors",
      outfit: { id: "o2", name: "x", slots: slots({ top: SWEATER }), why: "" },
    }),
    event({
      type: "disliked",
      reason: "colors",
      outfit: { id: "o3", name: "x", slots: slots({ top: SWEATER }), why: "" },
    }),
    event({ type: "swapped", detail: { slot: "top", fromId: SWEATER, toId: TEE } }),
  ];

  it("writes lines a person can read", () => {
    const aff = computeAffinity(events, { now: NOW });
    const lines = affinitySummaryLines(aff, labels);
    expect(lines.favorites[0]).toBe("Reaches for: white relaxed cotton t-shirt (worn 3×, saved 2×, swapped in 1×)");
    expect(lines.avoid).toContain("Tends to skip: navy wool crewneck sweater (disliked 2×, swapped out 1×)");
  });

  it("drops blocks that are no longer in the closet", () => {
    const aff = computeAffinity([event({ type: "worn" })], { now: NOW });
    const lines = affinitySummaryLines(aff, [{ id: JEANS, label: "denim blue straight jeans" }] as Block[]);
    expect(lines.favorites).toEqual(["Reaches for: denim blue straight jeans (worn 1×)"]);
  });

  it("caps each list at eight", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      event({
        type: "worn",
        outfit: { id: `o${i}`, name: "x", slots: slots({ top: `top-${i}` }), why: "" },
      }),
    );
    const blocks = [
      ...labels,
      ...Array.from({ length: 12 }, (_, i) => ({ id: `top-${i}`, label: `piece ${i}` })),
    ] as Block[];
    expect(affinitySummaryLines(computeAffinity(many, { now: NOW }), blocks).favorites).toHaveLength(8);
  });
});

describe("topFavorites / topSkipped", () => {
  it("splits on the sign of the score", () => {
    const aff = computeAffinity(
      [
        event({ type: "worn" }),
        event({
          type: "disliked",
          reason: "colors",
          outfit: { id: "o2", name: "x", slots: slots({ top: SWEATER }), why: "" },
        }),
      ],
      { now: NOW },
    );
    expect(topFavorites(aff).map((r) => r.blockId)).toContain(TEE);
    expect(topFavorites(aff).map((r) => r.blockId)).not.toContain(SWEATER);
    expect(topSkipped(aff).map((r) => r.blockId)).toEqual([SWEATER]);
  });
});
