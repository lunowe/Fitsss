/**
 * Pattern tiles, keyed by `Pattern` id (`src/domain/types`). Every tile is
 * markup in a 100×100 box painted with `var(--icon-pattern)` (and, sparingly,
 * the other icon variables). `compose.ts` explains how each kind is placed.
 *
 * Field tiles are scaled to the longer side of the garment's pattern box, so
 * their density is relative to the garment: a 100-unit tile covers a whole
 * tee or a whole pair of trousers. The counts below are tuned so each pattern
 * is still recognisable in a 56 px tile and not coarse at 240 px.
 *
 * This table is shipped to the iOS app as-is, so tiles stay within the SVG
 * subset GarmentArt draws: g, path, rect, circle, ellipse, line, polyline,
 * polygon, transforms, opacity, fill-opacity, stroke-dasharray.
 */
export interface PatternTile {
  kind: "field" | "motif" | "block";
  /** For motifs: which anchor the motif sits on. Default "graphic". */
  anchor?: "graphic" | "logo";
  markup: string;
  /** Field tiles only: the same tile for garments whose stripes run vertically. */
  markupV?: string;
}

const INK = `fill="var(--icon-pattern, #000)"`;
const n = (v: number) => String(Math.round(v * 100) / 100);

/** `count` bands of `width` across the tile, horizontal or vertical. */
function bands(vertical: boolean, count: number, width: number, offset = 0): string {
  const period = 100 / count;
  let out = "";
  for (let i = 0; i < count; i++) {
    const at = n(i * period + (period - width) / 2 + offset);
    out += vertical
      ? `<rect x="${at}" y="-2" width="${n(width)}" height="104"/>`
      : `<rect x="-2" y="${at}" width="104" height="${n(width)}"/>`;
  }
  return out;
}

/** A ditsy print: small four-petal flowers on a staggered grid, a dot between. */
function ditsy(): string {
  const flower = (cx: number, cy: number) =>
    `<ellipse cx="${n(cx)}" cy="${n(cy - 1.9)}" rx="1.6" ry="2.4"/><ellipse cx="${n(cx)}" cy="${n(cy + 1.9)}" rx="1.6" ry="2.4"/>` +
    `<ellipse cx="${n(cx - 1.9)}" cy="${n(cy)}" rx="2.4" ry="1.6"/><ellipse cx="${n(cx + 1.9)}" cy="${n(cy)}" rx="2.4" ry="1.6"/>`;
  let out = "";
  const step = 100 / 6;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      let cx = col * step + step / 2 + (row % 2 ? step / 2 : 0);
      if (cx > 100) cx -= 100;
      const cy = row * step + step / 2;
      out += flower(cx, cy) + `<circle cx="${n(cx)}" cy="${n(cy + step / 2)}" r="1.2"/>`;
    }
  }
  return `<g ${INK}>${out}</g>`;
}

/** Herringbone: columns of diagonal bands, alternating direction. */
function herringbone(): string {
  const cols = 10;
  const colW = 100 / cols;
  const pitch = 6;
  const w = 2;
  let out = "";
  for (let c = 0; c < cols; c++) {
    const x0 = c * colW;
    const x1 = x0 + colW;
    const dirn = c % 2 ? -1 : 1;
    for (let y = -colW - pitch; y < 100 + pitch; y += pitch) {
      // A parallelogram band at 45°, running from (x0, y) to (x1, y ± colW).
      const yA = y;
      const yB = y + dirn * colW;
      out += `<polygon points="${n(x0)},${n(yA)} ${n(x1)},${n(yB)} ${n(x1)},${n(yB + w)} ${n(x0)},${n(yA + w)}"/>`;
    }
  }
  return `<g ${INK} fill-opacity="0.3">${out}</g>`;
}

export const PATTERN_TILES: Record<string, PatternTile> = {
  // Breton stripes across; fine candy stripes down a shirt or trouser leg.
  stripe: { kind: "field", markup: `<g ${INK}>${bands(false, 11, 3.4)}</g>`, markupV: `<g ${INK}>${bands(true, 15, 2.1)}</g>` },
  // Gingham: two translucent band sets whose crossings read darker.
  check: {
    kind: "field",
    markup: `<g ${INK} fill-opacity="0.42">${bands(false, 7, 7.2)}${bands(true, 7, 7.2)}</g>`,
  },
  print: { kind: "field", markup: ditsy() },
  textured: { kind: "field", markup: herringbone() },
  // A chest graphic: a retro sunset disc, its lower half cut by bars in the
  // garment color.
  graphic: {
    kind: "motif",
    markup:
      `<circle cx="50" cy="50" r="40" ${INK}/>` +
      `<g fill="var(--icon-fill, #b3b3b3)"><rect x="8" y="54" width="84" height="4.5"/><rect x="8" y="65" width="84" height="5.5"/><rect x="8" y="77.5" width="84" height="6.5"/></g>`,
  },
  // A small round badge.
  logo: {
    kind: "motif",
    anchor: "logo",
    markup: `<circle cx="50" cy="50" r="40" fill="none" stroke="var(--icon-pattern, #000)" stroke-width="13"/><circle cx="50" cy="50" r="15" ${INK}/>`,
  },
  // The garment supplies its own panel; the fallback splits the field in two.
  colorblock: { kind: "block", markup: `<rect x="-2" y="50" width="104" height="52" ${INK}/>` },
};
