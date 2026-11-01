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
 * Motif tiles are scaled to the garment's `graphic` or `logo` anchor. Logo
 * anchors are about a sixth of the chest width, graphic anchors about half,
 * so a logo is a bold solid mark and a graphic is a composed print.
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
/** The garment's own color, for the negative space inside a motif. */
const GROUND = `fill="var(--icon-fill, #b3b3b3)"`;
const n = (v: number) => String(Math.round(v * 10) / 10);

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

/**
 * A ditsy print: small five-petal blossoms on a staggered grid, a dot in
 * every gap. Blossoms are ~6 units across, so a sleeve or hem cuts through
 * several of them instead of beheading one big motif; at closet size the
 * print reads as a fine speckle, at 240 px as flowers.
 */
function blossoms(): string {
  const cols = 8;
  const step = 100 / cols;
  const r = 1.55;
  const petal = r * 0.95;
  let petals = "";
  let holes = "";
  let dots = "";
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col <= cols; col++) {
      const cx = col * step + (row % 2 ? step / 2 : 0);
      const cy = row * step + step / 2;
      if (cx > 100 + r * 2) continue;
      for (let i = 0; i < 5; i++) {
        const a = ((i * 72 - 90) * Math.PI) / 180;
        petals += `<circle cx="${n(cx + Math.cos(a) * r)}" cy="${n(cy + Math.sin(a) * r)}" r="${n(petal)}"/>`;
      }
      holes += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.5)}"/>`;
      dots += `<circle cx="${n(cx + step / 2)}" cy="${n(cy + step / 2)}" r="0.8"/>`;
    }
  }
  return `<g ${INK}>${petals}${dots}</g><g ${GROUND}>${holes}</g>`;
}

/**
 * A fabric texture: a fine twill, diagonal ridges in the pattern color with a
 * faint ink groove between them. The pitch is 3 units, so at 240 px it is a
 * crisp weave and at 56 px a soft hatch; the ink grooves keep it visible even
 * when the pattern color is close to the garment's (cream on cream).
 */
function twill(): string {
  const pitch = 3;
  const w = 1;
  let ridges = "";
  let grooves = "";
  // Cover the tile's diagonal so the rotated bands leave no corner bare.
  for (let x = -24; x < 124; x += pitch) {
    ridges += `<rect x="${n(x)}" y="-24" width="${n(w)}" height="148"/>`;
    grooves += `<rect x="${n(x + pitch / 2)}" y="-24" width="${n(w)}" height="148"/>`;
  }
  return (
    `<g transform="rotate(30 50 50)">` +
    `<g ${INK} fill-opacity="0.5">${ridges}</g>` +
    `<g fill="var(--icon-stroke, #000)" fill-opacity="0.14">${grooves}</g>` +
    `</g>`
  );
}

export const PATTERN_TILES: Record<string, PatternTile> = {
  // Breton stripes across; fine candy stripes down a shirt or trouser leg.
  stripe: { kind: "field", markup: `<g ${INK}>${bands(false, 11, 3.4)}</g>`, markupV: `<g ${INK}>${bands(true, 15, 2.1)}</g>` },
  // Gingham: two translucent band sets whose crossings read darker.
  check: {
    kind: "field",
    markup: `<g ${INK} fill-opacity="0.42">${bands(false, 7, 7.2)}${bands(true, 7, 7.2)}</g>`,
  },
  print: { kind: "field", markup: blossoms() },
  textured: { kind: "field", markup: twill() },
  // A chest print: a framed landscape, the sun on the horizon over two bars
  // of sea, cut out of a solid block in the garment color.
  graphic: {
    kind: "motif",
    markup:
      `<rect x="8" y="16" width="84" height="64" ${INK}/>` +
      `<g ${GROUND}><path d="M30 58L30 56C30 44 39 36 50 36C61 36 70 44 70 56L70 58Z"/>` +
      `<rect x="8" y="60" width="84" height="3"/><rect x="8" y="67" width="84" height="4"/></g>`,
  },
  // A small embroidered mark: two solid peaks. Bold enough to read at a sixth
  // of the chest width, and nothing like the graphic.
  logo: {
    kind: "motif",
    anchor: "logo",
    markup: `<polygon points="6,80 36,26 52,52 66,18 94,80" ${INK}/>`,
  },
  // The garment supplies its own panel; the fallback splits the field in two.
  colorblock: { kind: "block", markup: `<rect x="-2" y="50" width="104" height="52" ${INK}/>` },
};
