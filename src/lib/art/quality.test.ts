import { describe, expect, it } from "vitest";

import { normalizeArt, type NormalizeOk } from "./normalize";
import { parseVerdict } from "./prompt";
import { inspectArt, isKeeper, scoreArt } from "./quality";

const art = (body: string): NormalizeOk => {
  const result = normalizeArt(`<svg viewBox="0 0 128 128">${body}</svg>`);
  if (!result.ok) throw new Error(result.errors.join(", "));
  return result;
};

const body = `<path d="M20 10 H 108 V 118 H 20 Z" fill="#B3B3B3" stroke="#000"/>`;

describe("inspectArt", () => {
  it("passes a plain, connected drawing", () => {
    const inspection = inspectArt(art(`${body}<path d="M30 30 H 98" fill="none" stroke="#000"/>`));
    expect(inspection.problems).toEqual([]);
    expect(inspection.clusters).toBe(1);
    expect(inspection.filled).toBe(1);
    expect(inspection.stroked).toBe(2);
  });

  it("flags a floating part", () => {
    const inspection = inspectArt(
      art(`${body}<path d="M30 30 H 98" fill="none" stroke="#000"/><circle cx="400" cy="400" r="5" fill="#8C8C8C" stroke="#000"/>`),
    );
    expect(inspection.clusters).toBe(2);
    expect(inspection.problems.join(" ")).toContain("floating");
  });

  it("flags a drawing that never takes the garment colour", () => {
    const inspection = inspectArt(
      art(`<path d="M20 10 H 108 V 118 H 20 Z" fill="#8C8C8C" stroke="#000"/><path d="M30 30 H 98" fill="none" stroke="#000"/>`),
    );
    expect(inspection.problems.join(" ")).toContain("body fill");
  });

  it("flags an over-detailed drawing", () => {
    const many = Array.from(
      { length: 45 },
      (_, i) => `<path d="M${10 + i} 10 V 118" fill="none" stroke="#000"/>`,
    ).join("");
    expect(inspectArt(art(many)).problems.join(" ")).toContain("more than the 40");
  });
});

describe("scoreArt / isKeeper", () => {
  const clean = inspectArt(art(`${body}<path d="M30 30 H 98" fill="none" stroke="#000"/>`));

  it("subtracts one point per structural problem", () => {
    const verdict = { recognizable: 5, styleMatch: 5, cleanliness: 5, problems: [], keep: true };
    expect(scoreArt(clean, verdict).total).toBe(15);
    const dirty = inspectArt(
      art(`${body}<path d="M30 30 H 98" fill="none" stroke="#000"/><circle cx="400" cy="400" r="5" fill="#8C8C8C" stroke="#000"/>`),
    );
    expect(scoreArt(dirty, verdict).total).toBeLessThan(15);
  });

  it("only keeps a drawing the reviewer would ship", () => {
    expect(isKeeper(scoreArt(clean, { recognizable: 5, styleMatch: 4, cleanliness: 4, problems: [], keep: true }))).toBe(true);
    expect(isKeeper(scoreArt(clean, { recognizable: 3, styleMatch: 5, cleanliness: 5, problems: [], keep: true }))).toBe(false);
    expect(isKeeper(scoreArt(clean, { recognizable: 5, styleMatch: 5, cleanliness: 5, problems: ["x"], keep: false }))).toBe(false);
  });
});

describe("parseVerdict", () => {
  it("reads a fenced verdict", () => {
    const verdict = parseVerdict('```json\n{"recognizable":4,"styleMatch":3,"cleanliness":5,"problems":["hem"],"keep":false}\n```');
    expect(verdict).toEqual({ recognizable: 4, styleMatch: 3, cleanliness: 5, problems: ["hem"], keep: false });
  });

  it("clamps and defaults nonsense", () => {
    const verdict = parseVerdict('prose {"recognizable": 9, "styleMatch": "2", "keep": "true"} more prose');
    expect(verdict).toEqual({ recognizable: 5, styleMatch: 2, cleanliness: 0, problems: [], keep: true });
  });

  it("returns null when there is no object", () => {
    expect(parseVerdict("nope")).toBeNull();
  });
});
