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

/**
 * Corduroy and rib knit, drawn as shaded wales. Each wale is a stack of
 * vertical strokes in the pattern color, narrowing towards the crest with a
 * cosine profile and a little off-centre (`asym`), so it is lit from one side;
 * between wales the ink draws a crease: a soft wide shadow and a narrower
 * line, both quiet, so on a dark piece (where the ink is a tint) the creases
 * do not turn into pinstripes. The field takes only a faint tint, so the
 * garment keeps its own color in the gaps and the pattern color shows in the
 * pile. Vertical lines only, so the tile rotates cleanly on a sleeve panel
 * and the markup stays tiny.
 */
function wales(count: number, asym: number): string {
  const p = 100 / count;
  const lines = (shift: number) => {
    let d = "";
    for (let i = 0; i <= count; i++) {
      const x = n(i * p + shift);
      d += `M${x} -2L${x} 102`;
    }
    return d;
  };
  const steps = [0.06, 0.07, 0.09, 0.12, 0.2];
  let out = `<rect x="-2" y="-2" width="104" height="104" ${INK} fill-opacity="0.05"/>`;
  steps.forEach((opacity, k) => {
    const t = (k + 1) / (steps.length + 1);
    const width = Math.cos((t * Math.PI) / 2) * 0.95;
    out += `<path d="${lines(p * (0.5 - asym * t))}" fill="none" stroke="var(--icon-pattern, #000)" stroke-width="${n(p * width)}" stroke-opacity="${opacity}"/>`;
  });
  out += `<path d="${lines(-p * 0.1)}" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="${n(p * 0.34)}" stroke-opacity="0.14"/>`;
  out += `<path d="${lines(0)}" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="${n(p * 0.2)}" stroke-opacity="0.16"/>`;
  return out;
}

/** A semicircle of radius `r` sitting on y = `cy`, as two quarter arcs. */
function dome(r: number, cy: number): string {
  const k = 0.5523 * r;
  return (
    `M${n(50 - r)} ${n(cy)}C${n(50 - r)} ${n(cy - k)} ${n(50 - k)} ${n(cy - r)} 50 ${n(cy - r)}` +
    `C${n(50 + k)} ${n(cy - r)} ${n(50 + r)} ${n(cy - k)} ${n(50 + r)} ${n(cy)}Z`
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
  // Textured: a rib knit on knits and tees (14 wales across the piece), a
  // corduroy on wovens (`markupV`, 20 wales). Both are shaded relief: the
  // pattern color in the pile, the garment color between, ink in the creases.
  // Ribs, not bands, so it is nothing like the stripe; no second direction,
  // so it is nothing like the check.
  textured: {
    kind: "field",
    markup: wales(14, 0.22),
    markupV: wales(20, 0.22),
  },
  // A chest print: a sun setting into three bars that shorten downwards,
  // solid in the pattern color with no frame, so it reads as a screen print
  // at closet size instead of a pocket, and fills its anchor.
  graphic: {
    kind: "motif",
    markup:
      `<g ${INK}><path d="${dome(44, 48)}"/>` +
      `<rect x="6" y="53" width="88" height="10"/><rect x="16" y="69" width="68" height="8"/>` +
      `<rect x="26" y="83" width="48" height="7"/></g>`,
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
