import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MAX_SVG_CHARS, normalizeSvgArt } from "./art-normalize";

/** A file as an illustrator exports it: classes, a stylesheet, ids, metadata. */
const MESSY = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" id="Layer_1" viewBox="0 0 120 90">
  <defs>
    <style>.cls-1 { fill: #cbb69a; } .cls-2 { fill: #3d3d3d; }</style>
    <linearGradient id="grad"><stop offset="0" stop-color="#fff"/></linearGradient>
  </defs>
  <title>kimono</title>
  <script>alert(1)</script>
  <g id="body">
    <path class="cls-1" style="fill:#cbb69a" d="M10 10h100v60H10Z"/>
    <path class="cls-1" style="fill:#cbb69a" d="M20 20h30v20H20Z"/>
    <path style="fill:#3d3d3d;stroke:#111;stroke-width:2" d="M60 20h40v20H60Z"/>
    <path style="fill:none;stroke:#111" d="M10 70h100"/>
    <path style="fill:#000000" d="M0 80h120v4H0Z"/>
    <image href="https://example.com/x.png" x="0" y="0" width="10" height="10"/>
    <rect x="0" y="0" width="4" height="4" fill="url(#grad)" onclick="steal()"/>
  </g>
</svg>`;

describe("normalizeSvgArt", () => {
  const result = normalizeSvgArt(MESSY);
  if (!result.ok) throw new Error(result.errors.join(", "));
  const { viewBox, body } = result.value;

  it("keeps the viewBox", () => {
    expect(viewBox).toBe("0 0 120 90");
  });

  it("makes the most common fill the garment colour", () => {
    expect(body).toContain('fill="var(--icon-fill, #b3b3b3)"');
    expect(body.match(/var\(--icon-fill, #b3b3b3\)/g)).toHaveLength(2);
  });

  it("sends other colours to the second fill and keeps black as detail", () => {
    expect(body).toContain('fill="var(--icon-fill-2, #3d3d3d)"');
    expect(body).toContain('fill="#000000"');
  });

  it("routes strokes through the ink variable and keeps stroke-width", () => {
    expect(body).toContain('stroke="var(--icon-stroke, #000)"');
    expect(body).toContain('stroke-width="2"');
    expect(body).toContain('fill="none"');
  });

  it("drops scripts, styles, metadata, ids, classes and external references", () => {
    expect(body).not.toContain("script");
    expect(body).not.toContain("<style");
    expect(body).not.toContain("<title");
    expect(body).not.toContain("class=");
    expect(body).not.toContain("id=");
    expect(body).not.toContain("onclick");
    expect(body).not.toContain("url(#grad)");
    expect(body).not.toContain("example.com");
    expect(body).not.toContain("style=");
  });

  it("keeps the shapes and the group they sit in", () => {
    expect(body.match(/<path/g)).toHaveLength(5);
    expect(body).toContain("<g>");
  });

  it("is idempotent over a built-in drawing", () => {
    const source = readFileSync("src/components/silhouettes/art/tee.svg", "utf8");
    const once = normalizeSvgArt(source);
    expect(once.ok).toBe(true);
    if (!once.ok) return;

    expect(once.value.viewBox).toBe("0 0 128 110.7");
    expect(once.value.body).toContain('fill="var(--icon-fill, #b3b3b3)"');

    const twice = normalizeSvgArt(`<svg viewBox="${once.value.viewBox}">${once.value.body}</svg>`);
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;
    expect(twice.value.body).toBe(once.value.body);
  });

  it("falls back to width and height when there is no viewBox", () => {
    const out = normalizeSvgArt('<svg width="64px" height="32px"><path d="M0 0h64v32H0Z" fill="#abc"/></svg>');
    expect(out.ok && out.value.viewBox).toBe("0 0 64 32");
  });

  it("rejects what it cannot draw", () => {
    expect(normalizeSvgArt("").ok).toBe(false);
    expect(normalizeSvgArt("<p>hello</p>").ok).toBe(false);
    expect(normalizeSvgArt('<svg viewBox="0 0 10 10"></svg>').ok).toBe(false);
    expect(normalizeSvgArt('<svg><path d="M0 0"/></svg>').ok).toBe(false);
    expect(normalizeSvgArt(`<svg viewBox="0 0 1 1">${"x".repeat(MAX_SVG_CHARS)}</svg>`).ok).toBe(false);
  });
});
