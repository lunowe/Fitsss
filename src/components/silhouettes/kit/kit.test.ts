import { describe, expect, it } from "vitest";

import { composeLayers } from "./compose";
import { KIT, kitKey } from "./index";
import { PATTERN_TILES } from "./patterns";

/**
 * The markup contract every kit drawing and pattern tile has to keep, because
 * the iPhone app draws the same strings with its own small SVG renderer.
 */
const ELEMENTS = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "clipPath"]);
const ATTRIBUTES = new Set([
  "d", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "points", "id", "clip-path",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "fill-opacity", "stroke-opacity", "opacity", "transform", "fill-rule", "vector-effect",
]);
const PAINT = /^(none|var\(--icon-(fill|fill-2|stroke|pattern)(, #[0-9a-f]{3,6})?\))$/;

function* tags(markup: string): Generator<{ name: string; attrs: Record<string, string> }> {
  for (const m of markup.matchAll(/<([a-zA-Z]+)([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[2].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    yield { name: m[1], attrs };
  }
}

function checkMarkup(markup: string, where: string, constantStroke = true) {
  for (const { name, attrs } of tags(markup)) {
    expect(ELEMENTS.has(name), `${where}: element <${name}>`).toBe(true);
    for (const [k, v] of Object.entries(attrs)) {
      expect(ATTRIBUTES.has(k), `${where}: attribute ${k} on <${name}>`).toBe(true);
      if (k === "fill" || k === "stroke") expect(v, `${where}: ${k}="${v}"`).toMatch(PAINT);
    }
    if (constantStroke && attrs.stroke && attrs.stroke !== "none" && name !== "g") {
      expect(attrs["vector-effect"], `${where}: <${name}> stroke without vector-effect`).toBe("non-scaling-stroke");
    }
    if (name === "path") expect(attrs.d, `${where}: path data`).toMatch(/^M[-\d.]+ [-\d.]+(?:[MLQC][-\d. ]+|Z)*$/);
  }
  expect(markup, `${where}: literal color`).not.toMatch(/(fill|stroke)="#/);
  expect(markup, `${where}: style or class`).not.toMatch(/\b(style|class)=/);
}

describe("kit pieces", () => {
  const entries = Object.entries(KIT);

  it("has the phase-1 reference pieces in every fit", () => {
    for (const fit of ["fitted", "regular", "relaxed", "oversized", "boxy"]) {
      expect(kitKey("t-shirt", undefined, fit)).toBe(`t-shirt@${fit}`);
      expect(kitKey("shirt", undefined, fit)).toBe(`shirt@${fit}`);
      expect(kitKey("hoodie", undefined, fit)).toBe(`hoodie@${fit}`);
    }
    for (const fit of ["skinny", "slim", "straight", "relaxed", "baggy", "wide"]) {
      expect(kitKey("jeans", undefined, fit)).toBe(`jeans@${fit}`);
    }
    for (const fit of ["mini", "midi", "maxi"]) expect(kitKey("skirt", undefined, fit)).toBe(`skirt@${fit}`);
    expect(kitKey("sneakers", "low-top")).toBe("sneakers~low-top");
    expect(kitKey("tote", "canvas-tote")).toBe("tote~canvas-tote");
    // A fit the type does not draw falls back to the type's default drawing.
    expect(kitKey("t-shirt", undefined, "slim")).toBe("t-shirt");
  });

  it.each(entries)("%s keeps the markup contract", (key, piece) => {
    expect(piece.body).toBe(piece.layers.base + piece.layers.lines);
    checkMarkup(piece.body, key);
    expect(piece.layers.clip).toMatch(/^M/);
    // Square viewBox that contains the pattern box.
    const [vx, vy, vw, vh] = piece.viewBox.split(" ").map(Number);
    expect(vw).toBeCloseTo(vh, 5);
    const [bx, by, bw, bh] = piece.layers.box;
    expect(bx).toBeGreaterThanOrEqual(vx);
    expect(by).toBeGreaterThanOrEqual(vy);
    expect(bx + bw).toBeLessThanOrEqual(vx + vw + 0.001);
    expect(by + bh).toBeLessThanOrEqual(vy + vh + 0.001);
    for (const anchor of [piece.layers.graphic, piece.layers.logo]) {
      if (!anchor) continue;
      const [cx, cy, size] = anchor;
      expect(cx - size / 2).toBeGreaterThanOrEqual(bx);
      expect(cx + size / 2).toBeLessThanOrEqual(bx + bw);
      expect(cy - size / 2).toBeGreaterThanOrEqual(by);
      expect(cy + size / 2).toBeLessThanOrEqual(by + bh);
    }
  });

  it.each(entries)("%s composes with every pattern tile", (key, piece) => {
    for (const pattern of Object.keys(PATTERN_TILES)) {
      const body = composeLayers(piece.layers, pattern, "clip1");
      if (body === undefined) continue; // motif without an anchor on this piece
      checkMarkup(body, `${key}:${pattern}`, false);
      expect(body.startsWith(piece.layers.base)).toBe(true);
      expect(body.endsWith(piece.layers.lines)).toBe(true);
    }
  });

  it("keeps the generated markup compact", () => {
    const total = entries.reduce((sum, [, p]) => sum + p.body.length, 0);
    expect(total / entries.length).toBeLessThan(6000);
  });
});

describe("pattern tiles", () => {
  it.each(Object.entries(PATTERN_TILES))("%s keeps the markup contract", (id, tile) => {
    // Tile strokes scale with the motif on purpose (a badge ring, a frame).
    checkMarkup(tile.markup, id, false);
    if (tile.markupV) checkMarkup(tile.markupV, `${id} (vertical)`, false);
  });
});
