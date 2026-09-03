import { describe, expect, it } from "vitest";
import { lineId, mergeLines, normalizeLineText, parseTasteLines } from "./lines";
import { mockTasteLines } from "./mock";
import {
  MAX_PROMPT_EVENTS,
  TASTE_SYSTEM_PROMPT,
  buildTastePrompt,
  buildTasteUserMessage,
  eventLine,
  tasteOutputSchema,
  type BuildTastePromptInput,
  type TasteEventForPrompt,
} from "./summarize-prompt";
import type { TasteLine } from "./types";

const NOW = "2026-09-02T08:00:00.000Z";

function line(text: string, source: TasteLine["source"], evidence?: number): TasteLine {
  return { id: lineId(text), text, source, ...(evidence ? { evidence } : {}), createdAt: NOW };
}

const EVENT: TasteEventForPrompt = {
  createdAt: "2026-09-02T08:00:00.000Z",
  type: "worn",
  occasion: "everyday",
  tempC: 21,
  labels: [
    "white relaxed cotton t-shirt",
    "denim blue straight jeans",
    "white leather low-top sneakers",
  ],
};

function input(over: Partial<BuildTastePromptInput> = {}): BuildTastePromptInput {
  return {
    scope: null,
    learned: [],
    learnedAvoid: [],
    userLines: [],
    userAvoid: [],
    affinity: { favorites: [], avoid: [] },
    events: [EVENT],
    ...over,
  };
}

describe("TASTE_SYSTEM_PROMPT", () => {
  it("is byte-stable", () => {
    // Change these two numbers only when the prompt is deliberately rewritten:
    // every byte here is the cached prefix of every summarizer call.
    expect(TASTE_SYSTEM_PROMPT).toHaveLength(1646);
    expect(lineId(TASTE_SYSTEM_PROMPT)).toBe("0v69kwk");
  });

  it("carries no scope- or request-specific text", () => {
    expect(TASTE_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(TASTE_SYSTEM_PROMPT).not.toMatch(/claude/i);
  });

  it("is the cached system block of the built prompt", () => {
    const built = buildTastePrompt(input());
    expect(built.system).toHaveLength(1);
    expect(built.system[0].text).toBe(TASTE_SYSTEM_PROMPT);
    expect(built.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(buildTastePrompt(input()).user).toBe(built.user);
  });
});

describe("eventLine", () => {
  it("writes the compact form with labels, not ids", () => {
    expect(eventLine(EVENT)).toBe(
      "2026-09-02 worn · Everyday · 21° · white relaxed cotton t-shirt + denim blue straight jeans + white leather low-top sneakers",
    );
  });

  it("appends the reason when there is one", () => {
    expect(eventLine({ ...EVENT, type: "disliked", reason: "too-warm" })).toContain("· too warm");
  });

  it("leaves out what it does not know", () => {
    expect(eventLine({ createdAt: NOW, type: "saved", labels: ["black wool coat"] })).toBe(
      "2026-09-02 saved · black wool coat",
    );
  });
});

describe("buildTasteUserMessage", () => {
  it("names the scope", () => {
    expect(buildTasteUserMessage(input())).toContain("This profile is overall, across styles.");
    const scoped = buildTasteUserMessage(
      input({ scope: { styleName: "Clean minimal", styleDescription: "Quiet colours, good fabric" } }),
    );
    expect(scoped).toContain("This profile is about one style: Clean minimal.");
    expect(scoped).toContain("Quiet colours, good fabric");
    expect(scoped).toContain("Do not repeat that description back.");
  });

  it("includes the user's own lines verbatim and marks them as true", () => {
    const user = buildTasteUserMessage(
      input({
        userLines: [line("I never tuck a t-shirt", "user")],
        userAvoid: [line("No logos on anything", "user")],
      }),
    );
    expect(user).toContain("STATED BY THE PERSON");
    expect(user).toContain("never repeat or contradict these");
    expect(user).toContain("- I never tuck a t-shirt");
    expect(user).toContain("- No logos on anything");
  });

  it("carries the standing profile with its evidence counts", () => {
    const user = buildTasteUserMessage(
      input({
        learned: [line("Prefers a loose top over straight trousers", "learned", 4)],
        learnedAvoid: [line("Avoids graphic tees for work", "learned", 2)],
      }),
    );
    expect(user).toContain("- Prefers a loose top over straight trousers (evidence: 4)");
    expect(user).toContain("- Avoids graphic tees for work (evidence: 2)");
  });

  it("includes the counted pieces", () => {
    const user = buildTasteUserMessage(
      input({ affinity: { favorites: ["Reaches for: white tee (worn 3×)"], avoid: [] } }),
    );
    expect(user).toContain("PIECES, COUNTED");
    expect(user).toContain("Reaches for: white tee (worn 3×)");
  });

  it("reads at most the last 60 events, oldest first", () => {
    const events = Array.from({ length: 80 }, (_, i) => ({
      ...EVENT,
      createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
    }));
    const user = buildTasteUserMessage(input({ events }));
    expect(user).toContain(`the last ${MAX_PROMPT_EVENTS} events, oldest first`);
    expect(user).not.toContain("2026-01-01");
    expect(user).toContain("2026-01-21");
    const first = user.indexOf("2026-01-21");
    const last = user.indexOf("2026-03-21");
    expect(first).toBeLessThan(last);
  });

  it("says so when there is nothing yet", () => {
    const user = buildTasteUserMessage(input({ events: [] }));
    expect(user).toContain("(nothing yet)");
    expect(user).toContain("(no events)");
  });
});

describe("tasteOutputSchema", () => {
  it("accepts the shape the summarizer must return", () => {
    const parsed = tasteOutputSchema.safeParse({
      lines: [{ text: "Prefers a loose top over straight trousers", evidence: 4 }],
      avoid: [{ text: "Skips graphic tees for work", evidence: 2 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a line without its evidence count", () => {
    expect(tasteOutputSchema.safeParse({ lines: [{ text: "x" }], avoid: [] }).success).toBe(false);
  });
});

describe("line merging", () => {
  const existing = [
    line("I never tuck a t-shirt", "user"),
    line("Prefers a loose top over straight trousers", "learned", 3),
  ];

  it("keeps the user's lines and replaces the learned ones", () => {
    const merged = mergeLines(
      existing,
      [{ text: "Reaches for white sneakers with everything", evidence: 5 }],
      NOW,
      12,
    );
    expect(merged.map((l) => l.text)).toEqual([
      "I never tuck a t-shirt",
      "Reaches for white sneakers with everything",
    ]);
    expect(merged[0].source).toBe("user");
    expect(merged[1]).toMatchObject({ source: "learned", evidence: 5 });
  });

  it("gives the same text the same id, so ids survive a refresh", () => {
    const merged = mergeLines(existing, [{ text: "Prefers a loose top over straight trousers" }], NOW, 12);
    expect(merged[1].id).toBe(existing[1].id);
    expect(merged[1].createdAt).toBe(existing[1].createdAt);
  });

  it("never repeats something the person already said", () => {
    const merged = mergeLines(existing, [{ text: "I never tuck a t-shirt", evidence: 9 }], NOW, 12);
    expect(merged.filter((l) => l.text === "I never tuck a t-shirt")).toHaveLength(1);
    expect(merged[0].source).toBe("user");
  });

  it("caps the learned half without touching the user half", () => {
    const learned = Array.from({ length: 20 }, (_, i) => ({ text: `Line number ${i}`, evidence: 1 }));
    const merged = mergeLines(existing, learned, NOW, 12);
    expect(merged.filter((l) => l.source === "learned")).toHaveLength(12);
    expect(merged.filter((l) => l.source === "user")).toHaveLength(1);
  });
});

describe("line validation", () => {
  it("takes 3 to 120 characters", () => {
    expect(normalizeLineText("ab")).toBeNull();
    expect(normalizeLineText("x".repeat(121))).toBeNull();
    expect(normalizeLineText("  loose   tops  ")).toBe("loose tops");
    expect(normalizeLineText(42)).toBeNull();
  });

  it("reads stored lines back and drops what is malformed", () => {
    const parsed = parseTasteLines([
      { id: "a", text: "Prefers loose tops", source: "user", createdAt: NOW },
      { text: "Avoids logos", source: "learned", evidence: 2, createdAt: NOW },
      { text: "x" },
      "nope",
      null,
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ id: "a", text: "Prefers loose tops", source: "user", createdAt: NOW });
    expect(parsed[1].source).toBe("learned");
    expect(parsed[1].id).toBe(lineId("Avoids logos"));
  });
});

describe("mock refresh", () => {
  const labels = new Map([
    ["tee", "white relaxed cotton t-shirt"],
    ["sweater", "navy wool crewneck sweater"],
  ]);
  const aff = new Map([
    ["tee", { blockId: "tee", score: 8, saves: 2, wears: 2, likes: 0, dislikes: 0, swapsIn: 0, swapsOut: 0 }],
    ["sweater", { blockId: "sweater", score: -3, saves: 0, wears: 0, likes: 0, dislikes: 2, swapsIn: 0, swapsOut: 1 }],
  ]);

  it("writes deterministic lines from the counted pieces", () => {
    const produced = mockTasteLines(aff, labels);
    expect(produced.lines).toEqual([{ text: "Reaches for white relaxed cotton t-shirt", evidence: 4 }]);
    expect(produced.avoid).toEqual([{ text: "Avoids navy wool crewneck sweater", evidence: 3 }]);
    expect(mockTasteLines(aff, labels)).toEqual(produced);
  });

  it("skips pieces that are no longer in the closet", () => {
    expect(mockTasteLines(aff, new Map()).lines).toEqual([]);
  });

  it("keeps the user's lines when the merge lands", () => {
    const stated = line("I never tuck a t-shirt", "user");
    const stale = line("Reaches for something long gone", "learned", 2);
    const produced = mockTasteLines(aff, labels);

    const merged = mergeLines([stated, stale], produced.lines, NOW, 12);
    expect(merged[0]).toEqual(stated);
    expect(merged.map((l) => l.text)).not.toContain("Reaches for something long gone");
    expect(merged.map((l) => l.text)).toContain("Reaches for white relaxed cotton t-shirt");

    const mergedAvoid = mergeLines([line("No logos on anything", "user")], produced.avoid, NOW, 8);
    expect(mergedAvoid.map((l) => l.text)).toEqual([
      "No logos on anything",
      "Avoids navy wool crewneck sweater",
    ]);
  });
});
