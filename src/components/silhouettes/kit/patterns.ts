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
 * `rows` lines across the tile (or down it) at the center of each row, one
 * subpath each: a dash pattern restarts on every subpath, so a dashed stroke
 * turns the lines into a grid of cells with almost no markup.
 */
function rules(rows: number, vertical: boolean, from: number, to: number): string {
  const period = 100 / rows;
  let d = "";
  for (let j = 0; j < rows; j++) {
    const at = n(j * period + period / 2);
    d += vertical ? `M${at} ${n(from)}L${at} ${n(to)}` : `M${n(from)} ${at}L${n(to)} ${at}`;
  }
  return d;
}

/**
 * A waffle knit, drawn tonally: the field takes a faint tint of the pattern
 * color, each well of the waffle a little more, and the ink casts a thin
 * shadow along the top and left of every well, which is what makes the cells
 * read as relief instead of a check. The wells are one dashed line per row,
 * as wide as a cell, so the whole tile is three elements. `cells` and `gap`
 * must divide 100 cleanly: the dash pattern repeats across the tile and a
 * rounded length would drift out of step with the rows.
 */
function waffle(cells: number, gap: number, tint: number, well: number, shadow: number, lift: number): string {
  const period = 100 / cells;
  const w = n(period - gap);
  const d = rules(cells, false, gap / 2, 100 + gap / 2);
  const dash = `stroke-dasharray="${w} ${n(gap)}" stroke-width="${w}"`;
  return (
    `<rect x="-2" y="-2" width="104" height="104" ${INK} fill-opacity="${tint}"/>` +
    `<path d="${d}" fill="none" stroke="var(--icon-stroke, #000)" ${dash} stroke-opacity="${shadow}" ` +
    `transform="translate(${n(-lift)} ${n(-lift)})"/>` +
    `<path d="${d}" fill="none" stroke="var(--icon-pattern, #000)" ${dash} stroke-opacity="${well}"/>`
  );
}

/**
 * A basketweave (oxford cloth, hopsack): two short bars per cell, across in
 * one cell and down in the next, over a faint tint, with the same thin ink
 * shadow as the waffle. Four dashed lines per row and per column; the dash
 * period is two cells, so `cells` must divide 100 cleanly here too.
 */
function basketweave(cells: number, width: number, gap: number, tint: number, bar: number, shadow: number): string {
  const period = 100 / cells;
  // Dash period is two cells; cover the tile plus one cell with whole periods.
  const span = Math.ceil((100 + period) / (2 * period)) * 2 * period;
  let d = "";
  for (let j = 0; j < cells; j++) {
    const even = j % 2 === 0;
    for (const side of [-1, 1]) {
      const at = n(j * period + period / 2 + (side * period) / 4);
      // Rows start a cell later on odd rows, columns on even ones, so the
      // bars of the two directions never share a cell. Every line is a whole
      // number of dash periods long, so a renderer that runs one dash phase
      // across subpaths (Core Graphics) draws the same tile as one that
      // restarts it (SVG).
      const rowStart = (even ? 0 : period) + gap / 2;
      const colStart = (even ? period : 0) + gap / 2;
      d += `M${n(rowStart)} ${at}L${n(rowStart + span)} ${at}`;
      d += `M${at} ${n(colStart)}L${at} ${n(colStart + span)}`;
    }
  }
  const dash = `stroke-dasharray="${n(period - gap)} ${n(period + gap)}" stroke-width="${n(width)}"`;
  return (
    `<rect x="-2" y="-2" width="104" height="104" ${INK} fill-opacity="${tint}"/>` +
    `<path d="${d}" fill="none" stroke="var(--icon-stroke, #000)" ${dash} stroke-opacity="${shadow}" transform="translate(0.5 0.5)"/>` +
    `<path d="${d}" fill="none" stroke="var(--icon-pattern, #000)" ${dash} stroke-opacity="${bar}"/>`
  );
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
  // Textured: a waffle knit on knits and tees, a basketweave on wovens
  // (`markupV`). Both are tonal: a faint tint of the pattern color with the
  // structure in ink relief, so the piece still reads as its own color with a
  // visible knit or weave, on light and dark grounds and when the pattern
  // color is close to the garment's.
  textured: {
    kind: "field",
    markup: waffle(25, 1.2, 0.08, 0.2, 0.14, 0.5),
    markupV: basketweave(25, 0.9, 0.8, 0.1, 0.26, 0.08),
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
