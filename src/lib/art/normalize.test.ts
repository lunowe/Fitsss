import { describe, expect, it } from "vitest";

import { pathBox } from "./geometry";
import { clusterCount, extractSvg, ICON_FILL, ICON_FILL_2, ICON_STROKE, normalizeArt } from "./normalize";

const wrap = (body: string, viewBox = "0 0 128 128") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

const ok = (raw: string) => {
  const result = normalizeArt(raw);
  if (!result.ok) throw new Error(`expected ok, got: ${result.errors.join(", ")}`);
  return result;
};

describe("extractSvg", () => {
  it("finds the svg inside prose and a fence", () => {
    expect(extractSvg("Here you go:\n```svg\n<svg viewBox='0 0 1 1'><path d='M0 0'/></svg>\n```")).toContain("<svg");
    expect(extractSvg("<svg viewBox='0 0 1 1'></svg> trailing words")).toBe("<svg viewBox='0 0 1 1'></svg>");
  });

  it("returns null when there is no svg", () => {
    expect(extractSvg("I cannot draw that.")).toBeNull();
  });
});

describe("pathBox", () => {
  it("measures straight segments", () => {
    expect(pathBox("M10 20 H 40 V 50 Z")).toEqual({ x1: 10, y1: 20, x2: 40, y2: 50 });
  });

  it("takes curve extrema, not control points", () => {
    // A cubic whose control points reach y=0 but whose curve only reaches y=25.
    const box = pathBox("M0 100 C 0 0 100 0 100 100");
    expect(box?.y1).toBeCloseTo(25, 5);
    expect(box?.y2).toBeCloseTo(100, 5);
  });

  it("handles relative commands and arcs", () => {
    const box = pathBox("M10 10 l 20 0 a 10 10 0 0 1 0 20 l -20 0 z");
    expect(box?.x1).toBeCloseTo(10, 3);
    expect(box?.x2).toBeCloseTo(40, 3);
    expect(box?.y2).toBeCloseTo(30, 3);
  });
});

describe("normalizeArt", () => {
  it("rewrites the literal palette into the tint variables", () => {
    const art = ok(wrap(`<path d="M10 10 H 100 V 100 H 10 Z" fill="#B3B3B3" stroke="#000" stroke-width="1.2"/>`));
    expect(art.svg).toContain(ICON_FILL);
    expect(art.svg).toContain(ICON_STROKE);
    expect(art.svg).toContain('vector-effect="non-scaling-stroke"');
    expect(art.svg).toContain('stroke-width="1"');
    expect(art.svg).not.toContain("#B3B3B3");
  });

  it("maps the detail colour and leaves seams unfilled", () => {
    const art = ok(
      wrap(
        `<path d="M10 10 H 100 V 100 H 10 Z" fill="#B3B3B3" stroke="#000"/>` +
          `<path d="M20 20 H 90" fill="none" stroke="#000"/>` +
          `<rect x="10" y="10" width="90" height="12" fill="#8C8C8C" stroke="#000"/>`,
      ),
    );
    expect(art.paints).toEqual([
      { fill: ICON_FILL, stroke: ICON_STROKE },
      { fill: "none", stroke: ICON_STROKE },
      { fill: ICON_FILL_2, stroke: ICON_STROKE },
    ]);
  });

  it("guesses a fill when the model forgot one", () => {
    const art = ok(wrap(`<path d="M10 10 H 100 V 100 H 10 Z" stroke="#000"/><path d="M20 20 H 90" stroke="#000"/>`));
    expect(art.paints[0].fill).toBe(ICON_FILL);
    expect(art.paints[1].fill).toBe("none");
    expect(art.warnings.join(" ")).toContain("had no fill");
  });

  it("moves off-palette colours onto the detail fill and reports it", () => {
    const art = ok(wrap(`<path d="M10 10 H 100 V 100 H 10 Z" fill="#ff0044" stroke="#123456"/>`));
    expect(art.paints[0]).toEqual({ fill: ICON_FILL_2, stroke: ICON_STROKE });
    expect(art.warnings.some((w) => w.includes("off-palette fill"))).toBe(true);
    expect(art.warnings.some((w) => w.includes("off-palette stroke"))).toBe(true);
  });

  it("rejects unsafe markup outright", () => {
    for (const bad of [
      `<script>alert(1)</script><path d="M0 0 H 10 V 10 Z" fill="#B3B3B3"/>`,
      `<image href="http://x/y.png" width="10" height="10"/>`,
      `<foreignObject><div/></foreignObject>`,
      `<style>path{fill:red}</style><path d="M0 0 H 10 V 10 Z" fill="#B3B3B3"/>`,
      `<use href="#a"/>`,
    ]) {
      const result = normalizeArt(wrap(bad));
      expect(result.ok, bad).toBe(false);
    }
  });

  it("drops decorative markup instead of rejecting the drawing", () => {
    const art = ok(
      wrap(
        `<title>skirt</title><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>` +
          `<text x="5" y="5">skirt</text>` +
          `<path d="M10 10 H 100 V 100 H 10 Z" fill="#B3B3B3" stroke="#000"/>`,
      ),
    );
    expect(art.elements).toBe(1);
    expect(art.warnings.join(" ")).toContain("dropped <text>");
  });

  it("fails when nothing drawable is left", () => {
    const result = normalizeArt(wrap(`<g></g>`));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("no drawable geometry");
  });

  it("crops to the art plus 4% on a 128 long side", () => {
    // Art occupying a 40x20 patch in the corner of a 1000-unit canvas.
    const art = ok(wrap(`<rect x="500" y="600" width="40" height="20" fill="#B3B3B3" stroke="#000"/>`, "0 0 1000 1000"));
    const [, , w, h] = art.viewBox.split(" ").map(Number);
    expect(Math.max(w, h)).toBeCloseTo(128, 1);
    // 40 wide + 2 * 4% of 40 padding = 43.2 wide, 20 + 3.2 = 23.2 tall.
    expect(w / h).toBeCloseTo(43.2 / 23.2, 2);
  });

  it("keeps the drawing put through a second pass", () => {
    const once = ok(wrap(`<path d="M10 10 H 100 V 100 H 10 Z" fill="#B3B3B3" stroke="#000"/>`));
    const twice = ok(once.svg);
    expect(twice.viewBox).toBe(once.viewBox);
    expect(twice.paints).toEqual(once.paints);
  });

  it("inherits paint from a wrapping group", () => {
    const art = ok(
      wrap(
        `<g fill="#B3B3B3" stroke="#000" stroke-width="1.2">` +
          `<path d="M10 10 H 100 V 100 H 10 Z"/>` +
          `<path d="M20 20 H 90" fill="none"/>` +
          `</g>`,
      ),
    );
    expect(art.paints).toEqual([
      { fill: ICON_FILL, stroke: ICON_STROKE },
      { fill: "none", stroke: ICON_STROKE },
    ]);
    expect(art.warnings.join(" ")).not.toContain("invisible");
  });

  it("folds group transforms into the elements", () => {
    const art = ok(wrap(`<g transform="translate(100 0)"><rect x="0" y="0" width="10" height="10" fill="#B3B3B3"/></g>`));
    expect(art.box.x1).toBeCloseTo(100, 5);
    expect(art.svg).toContain("translate(100 0)");
  });
});

describe("clusterCount", () => {
  it("counts touching boxes as one cluster", () => {
    expect(
      clusterCount([
        { x1: 0, y1: 0, x2: 10, y2: 10 },
        { x1: 9, y1: 0, x2: 20, y2: 10 },
      ]),
    ).toBe(1);
  });

  it("counts a detached box separately", () => {
    expect(
      clusterCount([
        { x1: 0, y1: 0, x2: 10, y2: 10 },
        { x1: 60, y1: 60, x2: 70, y2: 70 },
      ]),
    ).toBe(2);
  });
});
