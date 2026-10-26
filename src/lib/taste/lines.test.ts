import { describe, expect, it } from "vitest";

import { lineId, makeLine, mergeLines, refreshCandidates } from "./lines";

const at = "2026-10-13T09:00:00.000Z";
const learned = (text: string) => makeLine(text, "learned", 3, at);
const said = (text: string) => makeLine(text, "user", undefined, at);

describe("a refresh overlapping the person's edits", () => {
  it("keeps a line deleted while the model was thinking deleted", () => {
    const before = [said("No logos"), learned("Reaches for navy"), learned("Prefers loose tops")];
    // Deleted "Reaches for navy" and added "Earth tones" during the refresh.
    const now = [said("Earth tones"), said("No logos"), learned("Prefers loose tops")];
    const produced = [{ text: "Reaches for navy", evidence: 5 }, { text: "Prefers loose tops", evidence: 4 }, { text: "Likes boots" }];

    const merged = mergeLines(now, refreshCandidates(produced, before, now), at, 12);

    expect(merged.map((line) => line.text)).toEqual(["Earth tones", "No logos", "Prefers loose tops", "Likes boots"]);
    expect(merged.some((line) => line.id === lineId("Reaches for navy"))).toBe(false);
  });

  it("changes nothing when nothing was deleted", () => {
    const before = [learned("Reaches for navy")];
    const produced = [{ text: "Reaches for navy" }];
    expect(refreshCandidates(produced, before, before)).toBe(produced);
  });

  it("lets a line the model found anew come back after an earlier deletion", () => {
    // Deleted before the refresh started: not in `before`, so the model may find it again.
    const before = [learned("Prefers loose tops")];
    expect(refreshCandidates([{ text: "Reaches for navy" }], before, before)).toHaveLength(1);
  });

  it("never writes a learned line back next to the person's own, in either list", () => {
    const before = [learned("Earth tones")];
    // Deleted the learned like, then said the same as an avoid.
    const lines: ReturnType<typeof learned>[] = [];
    const avoid = [said("Earth tones")];
    const now = [...lines, ...avoid];
    const produced = { lines: [{ text: "Earth tones", evidence: 6 }], avoid: [{ text: "earth   tones" }] };

    const likes = mergeLines(lines, refreshCandidates(produced.lines, before, now), at, 12);
    const avoids = mergeLines(avoid, refreshCandidates(produced.avoid, before, now), at, 8);

    expect(likes).toEqual([]);
    expect(avoids.map((line) => [line.text, line.source])).toEqual([["Earth tones", "user"]]);
  });
});
