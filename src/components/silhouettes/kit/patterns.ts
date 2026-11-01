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
 * anchors are just under a quarter of the chest width, graphic anchors about
 * half, so a logo is a bold solid mark and a graphic is a composed print.
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

/** A small deterministic PRNG (mulberry32), so the marl is the same on every client. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Coordinates to half a unit: irregular enough to hide any grid, short enough to keep the tile small. */
const h = (v: number) => String(Math.round(v * 2) / 2);

/**
 * Short rounded dashes at random angles, one per cell of a jittered grid so
 * the cover is even without ever lining up. Returns one stroked path.
 */
function flecks(seed: number, cells: number, len: [number, number], width: number, opacity: number): string {
  const r = rng(seed);
  const step = 100 / cells;
  let d = "";
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const cx = i * step + r() * step;
      const cy = j * step + r() * step;
      const half = (len[0] + r() * (len[1] - len[0])) / 2;
      const a = r() * Math.PI;
      const dx = Math.cos(a) * half;
      const dy = Math.sin(a) * half;
      d += `M${h(cx - dx)} ${h(cy - dy)}L${h(cx + dx)} ${h(cy + dy)}`;
    }
  }
  return (
    `<path d="${d}" fill="none" stroke="var(--icon-pattern, #000)" stroke-width="${n(width)}" ` +
    `stroke-linecap="round" stroke-opacity="${opacity}"/>`
  );
}

/**
 * A fabric texture: a marl. Two layers of short flecks in the pattern color,
 * a soft dense one and a sparser stronger one, so the surface has tonal depth
 * instead of one kind of mark; plus a scatter of ink specks that keeps the
 * weave visible when the pattern color is close to the garment's (stone on
 * white) and reads as the dark fibre of a heather. Nothing has a direction,
 * so the same tile works rotated on a sleeve panel. At 240 px it is a flecked
 * knit, at 96 px a quiet speckle, at 56 px a soft tint.
 */
function marl(): string {
  const r = rng(29);
  let specks = "";
  for (let i = 0; i < 320; i++) {
    const x = r() * 100;
    const y = r() * 100;
    specks += `M${h(x)} ${h(y)}L${h(x + 0.5)} ${h(y + 0.5)}`;
  }
  return (
    flecks(11, 34, [0.9, 2.2], 0.55, 0.4) +
    flecks(5, 24, [1, 2.4], 0.6, 0.6) +
    `<path d="${specks}" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="0.55" ` +
    `stroke-linecap="round" stroke-opacity="0.24"/>`
  );
}

/** `count`² squares where the bands of a gingham cross. */
function crossings(count: number, width: number): string {
  const period = 100 / count;
  let out = "";
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const x = n(i * period + (period - width) / 2);
      const y = n(j * period + (period - width) / 2);
      out += `<rect x="${x}" y="${y}" width="${n(width)}" height="${n(width)}"/>`;
    }
  }
  return out;
}

export const PATTERN_TILES: Record<string, PatternTile> = {
  // Breton stripes across; fine candy stripes down a shirt or trouser leg.
  stripe: { kind: "field", markup: `<g ${INK}>${bands(false, 11, 3.4)}</g>`, markupV: `<g ${INK}>${bands(true, 15, 2.1)}</g>` },
  // Gingham: two translucent band sets, and the crossings painted again at
  // near full strength, as the dyed yarn would be. That keeps a pale check
  // (navy on cream) legible without making a cream-on-navy one heavy.
  check: {
    kind: "field",
    markup:
      `<g ${INK} fill-opacity="0.42">${bands(false, 7, 7.4)}${bands(true, 7, 7.4)}</g>` +
      `<g ${INK} fill-opacity="0.75">${crossings(7, 7.4)}</g>`,
  },
  print: { kind: "field", markup: blossoms() },
  textured: { kind: "field", markup: marl() },
  // A chest print: a framed landscape, the sun on the horizon over two bars
  // of sea, cut out of a solid block in the garment color.
  graphic: {
    kind: "motif",
    markup:
      `<rect x="8" y="16" width="84" height="64" ${INK}/>` +
      `<g ${GROUND}><path d="M30 58L30 56C30 44 39 36 50 36C61 36 70 44 70 56L70 58Z"/>` +
      `<rect x="8" y="60" width="84" height="3"/><rect x="8" y="67" width="84" height="4"/></g>`,
  },
  // A small embroidered mark: a solid roundel with two peaks cut out of it.
  // The disc fills the anchor, so at closet size it is still a crisp dot of
  // pattern color; the peaks appear from ~96 px. Nothing like the graphic.
  logo: {
    kind: "motif",
    anchor: "logo",
    markup: `<circle cx="50" cy="50" r="49" ${INK}/><polygon points="8,76 34,34 47,54 63,26 92,76" ${GROUND}/>`,
  },
  // The garment supplies its own panel; the fallback splits the field in two.
  colorblock: { kind: "block", markup: `<rect x="-2" y="50" width="104" height="52" ${INK}/>` },
};
