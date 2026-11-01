/**
 * Shared parts for footwear and accessories: soles that share one ground
 * line and toe spring, lacing, metal hardware, and a smooth ribbon for
 * straps and scarves. Every shoe is a side view with the toe to the right;
 * the upper meets the sole at `GROUND` and the toe lifts off it by `spring`.
 */
import { add, C, FILL2, fill, ink, INK, L, lerp, num, path, polyline, Q, seam, shade, stroke, type Pt, type Seg } from "./draw";

/** y where an upper meets its sole. */
export const GROUND = 118;

/** Tone of an outsole under its midsole: a split you can see, not a second shoe underneath. */
export const OUTSOLE = 0.08;

/**
 * Every shoe is seen a touch from above, so its opening shows as a dark lens
 * along the topline: the inside of a collar behind the tongue, the mouth of a
 * loafer, the far wall of a sandal strap. One depth, one tone for the family.
 */
export const MOUTH = 0.3;

/**
 * The opening of a shoe as a lens: `top` runs along the topline from the heel
 * towards the throat; the lens is `depth` deep at its middle and tapers to
 * nothing at both ends. Returns the shade only; the topline's ink is the
 * upper's own outline.
 */
export function mouthLens(top: readonly Pt[], depth: number, opacity = MOUTH): string {
  const n = top.length - 1;
  const lower: Pt[] = [];
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    lower.push([top[i][0], top[i][1] + depth * Math.sin(Math.PI * t) ** 0.8]);
  }
  const d = path(top[0], [...splineSegs(top), ...splineSegs(lower)], true);
  return shade(d, opacity);
}

/* ------------------------------------------------------------------ */
/* Soles                                                                */
/* ------------------------------------------------------------------ */

export interface SoleSpec {
  /** x of the heel back and of the toe tip, at the top of the sole. */
  x0: number;
  x1: number;
  /** Sole thickness under the ball of the foot. */
  depth: number;
  /** How far the toe lifts off the ground. */
  spring?: number;
  /** Height of a separate heel block (dress shoes, boots), 0 for a flat sole. */
  heel?: number;
  /** Length of the heel block from the back. */
  heelLen?: number;
  /** How far the heel breast slants back from top to bottom (a western boot's underslung heel). */
  heelSlant?: number;
  /** Extra thickness at the heel for a cushioned (running) midsole. */
  heelLift?: number;
  /** Where the sole starts rising to the toe, from the toe tip. */
  ball?: number;
  /** Midsole/outsole split (sneakers): the outsole is a shade darker. */
  midsole?: boolean;
  /** A welt stitch just under the top edge (leather soles). */
  welt?: boolean;
  /** Lugs along the bottom (hiking, work). */
  lugs?: boolean;
  /** A wavy bottom edge (chunky). */
  wave?: boolean;
}

export interface Sole {
  fills: string;
  lines: string;
  /** Closed outline, for the piece extent. */
  path: string;
  /** Segments of the top edge from the toe tip back to the heel, for closing an upper. */
  topBack: readonly Seg[];
  /** The toe tip of the upper: (x1, GROUND - spring). */
  toe: Pt;
  /** y of the bottom of the sole under the ball. */
  bottom: number;
}

/** The sole under an upper. The upper closes along `topBack` from `toe` to (x0, GROUND). */
export function footSole(s: SoleSpec): Sole {
  const Y = GROUND;
  const { x0, x1, depth } = s;
  const spring = s.spring ?? 4;
  const heel = s.heel ?? 0;
  const heelLen = s.heelLen ?? 38;
  const lift = s.heelLift ?? 0;
  const ball = s.ball ?? 44;
  const xb = x1 - ball;
  const toe: Pt = [x1, Y - spring];
  const yBot = Y + depth;
  const toeBottom: Pt = [x1 - 5, yBot - spring + 0.5];
  // Top edge, toe to heel.
  const topBack: Seg[] = [Q([x1 - ball * 0.3, Y], [xb, Y]), L([x0, Y])];
  // Outline, clockwise from the heel: along the top, round the toe, back
  // along the bottom (flat, with a lift at the toe), round the heel.
  const segs: Seg[] = [
    L([xb, Y]),
    Q([x1 - ball * 0.3, Y], toe),
    C([x1 + 4.5, toe[1] + 1], [x1 + 4, yBot - spring - 1], toeBottom),
  ];
  // Bottom edge from the toe back to the heel.
  const flatFrom = xb - 4;
  segs.push(Q([x1 - ball * 0.55, yBot + 0.4], [flatFrom, yBot]));
  const heelBottom = yBot + heel + lift;
  if (s.wave) {
    // Chunky: a soft scallop under the midfoot.
    segs.push(C([flatFrom - 14, yBot + 1], [flatFrom - 18, yBot - 4], [flatFrom - 30, yBot - 3]));
    segs.push(C([flatFrom - 40, yBot - 2], [flatFrom - 44, yBot + 1], [x0 + 8, heelBottom]));
  } else if (s.lugs) {
    // Lugs: shallow teeth cut into the bottom.
    let x = flatFrom - 6;
    while (x > x0 + 16) {
      segs.push(L([x, yBot + lift * ((flatFrom - x) / (flatFrom - x0))]));
      const y = yBot + lift * ((flatFrom - x) / (flatFrom - x0));
      segs.push(L([x - 3, y - 3]), L([x - 7, y - 3]), L([x - 10, y]));
      x -= 14;
    }
    segs.push(L([x0 + 7, heelBottom]));
  } else if (heel > 0) {
    // A heel block: the breast slopes slightly, then the flat heel.
    const breast = x0 + heelLen;
    const slant = s.heelSlant ?? 1;
    segs.push(L([breast + 6, yBot]), Q([breast + 1, yBot + 1], [breast, yBot + heel * 0.35]), L([breast - slant, heelBottom]), L([x0 + 6, heelBottom]));
  } else if (lift > 0) {
    segs.push(C([xb - 30, yBot + lift * 0.3], [x0 + 30, heelBottom], [x0 + 7, heelBottom]));
  } else {
    segs.push(L([x0 + 7, yBot]));
  }
  // Round the heel.
  segs.push(C([x0 - 2.5, heelBottom], [x0 - 2.5, Y + 2.5], [x0, Y]));
  const d = path([x0, Y], segs, true);

  const fills: string[] = [fill(d, FILL2)];
  const lines: string[] = [];
  if (s.midsole) {
    // Outsole: the bottom third of the sole, a shade darker, split by a seam.
    const split = Math.max(3.5, depth * 0.42);
    const sy = yBot - split;
    const splitLine = path([x0 - 1.8, sy + lift * 0.9], [Q([xb, sy + 0.4], [x1 + 1.5, sy - spring * 0.75])]);
    const out = path([x0 - 1.8, sy + lift * 0.9], [
      Q([xb, sy + 0.4], [x1 + 1.5, sy - spring * 0.75]),
      C([x1 + 2.2, sy - spring * 0.4], [x1 + 2, yBot - spring - 1], toeBottom),
      Q([x1 - ball * 0.55, yBot + 0.4], [flatFrom, yBot]),
      ...(lift > 0 ? [C([xb - 30, yBot + lift * 0.3], [x0 + 30, heelBottom], [x0 + 7, heelBottom])] : [L([x0 + 7, yBot])]),
      C([x0 - 1.2, heelBottom], [x0 - 2.4, heelBottom - 2], [x0 - 2.4, heelBottom - 3]),
    ], true);
    // A whisper of tone, no more: a sole must not weigh more than a garment's hem band.
    fills.push(shade(out, OUTSOLE));
    lines.push(seam(splitLine));
  }
  if (s.welt) {
    lines.push(seam(path([x0 + 1.5, Y + 2.6], [L([xb, Y + 2.6]), Q([x1 - ball * 0.3, Y + 2.6], [x1 + 0.5, Y - spring + 2.4])])));
  }
  return { fills: fills.join(""), lines: ink(stroke(d), ...lines), path: d, topBack, toe, bottom: yBot };
}

/* ------------------------------------------------------------------ */
/* Lacing and small parts                                               */
/* ------------------------------------------------------------------ */

/** Width of a lace drawn as a band (sneakers, boots): bold enough to read at 56 px. */
export const LACE_W = 2.8;

/**
 * One lace crossing a stay as a flat band from `top` to `bot`, `w` wide along
 * the direction `u` of the stay's edge. Returns the band's closed path.
 */
export function laceBand(top: Pt, bot: Pt, u: Pt, w = LACE_W): string {
  const h = w / 2;
  return path(add(top, u, -h), [L(add(top, u, h)), L(add(bot, u, h)), L(add(bot, u, -h))], true);
}

export interface Laces {
  /** The bands in the second color, drawn before the ink. */
  fills: string;
  /** Their edges, for `ink()`. */
  lines: string[];
}

/** Lace bands as a part: fills in `FILL2`, edges in ink. */
export function laces(bands: readonly string[]): Laces {
  return { fills: bands.map((d) => fill(d, FILL2)).join(""), lines: bands.map((d) => stroke(d)) };
}

/**
 * Lace bars across an eyestay from its top edge (`a0`→`a1`) to its bottom
 * edge (`b0`→`b1`), `count` of them, each leaning like the reference sneaker,
 * drawn as flat bands of the second color.
 */
export function laceBars(a0: Pt, a1: Pt, b0: Pt, b1: Pt, count: number, w = LACE_W): Laces {
  const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1;
  const u: Pt = [(a1[0] - a0[0]) / len, (a1[1] - a0[1]) / len];
  const bands: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    bands.push(laceBand(lerp(a0, a1, t + 0.035), lerp(b0, b1, t - 0.035), u, w));
  }
  return laces(bands);
}


/** Crossed laces between two eyelet rows, each a small X. */
export function crossLaces(a0: Pt, a1: Pt, b0: Pt, b1: Pt, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = i / count;
    const t1 = (i + 1) / count;
    out.push(stroke(polyline(lerp(a0, a1, t0 + 0.08), lerp(b0, b1, t1 - 0.08))));
    out.push(stroke(polyline(lerp(b0, b1, t0 + 0.08), lerp(a0, a1, t1 - 0.08))));
  }
  return out;
}

/** A small eyelet: a ring of ink around a dot of the second color. */
export const eyelet = (p: Pt, r = 1.6): string =>
  `<circle cx="${num(p[0])}" cy="${num(p[1])}" r="${num(r)}" fill="${FILL2}" stroke="${INK}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;

/** An unfilled ring of ink (a watch bezel, a D-ring). */
export const ring = (cx: number, cy: number, r: number, opacity?: number): string =>
  `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="none" stroke="${INK}" stroke-width="1"${opacity !== undefined ? ` stroke-opacity="${num(opacity)}"` : ""} vector-effect="non-scaling-stroke"/>`;

/** A filled disc with an ink edge, in any paint. */
export const disc = (cx: number, cy: number, r: number, paint: string): string =>
  `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="${paint}"/>`;

/**
 * Metal: the second color under the ink at a low opacity reads as hardware
 * on light and dark pieces alike (hardware off the garment needs the base
 * fill too, or it vanishes on a dark piece whose ink is light).
 */
export const METAL = 0.28;
export const metal = (d: string): string => fill(d, FILL2) + shade(d, METAL);

/** A rounded rectangle as path data. */
export function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return path([x + rr, y], [
    L([x + w - rr, y]), Q([x + w, y], [x + w, y + rr]),
    L([x + w, y + h - rr]), Q([x + w, y + h], [x + w - rr, y + h]),
    L([x + rr, y + h]), Q([x, y + h], [x, y + h - rr]),
    L([x, y + rr]), Q([x, y], [x + rr, y]),
  ], true);
}

/**
 * A frame buckle `w`×`h` with its prong, centered at (cx, cy); the strap runs
 * left to right and shows through the open frame, the prong lying across it
 * from the left bar to the right one.
 */
export function buckle(cx: number, cy: number, w: number, h: number, bar = 2.6): { fills: string; lines: string; frame: string } {
  const outer = roundRect(cx - w / 2, cy - h / 2, w, h, 2.2);
  const inner = roundRect(cx - w / 2 + bar, cy - h / 2 + bar, w - 2 * bar, h - 2 * bar, 1);
  const pw = Math.max(1.4, bar * 0.45);
  const prong = roundRect(cx - w / 2 + bar * 0.5, cy - pw / 2, w - bar * 0.9, pw, pw / 2);
  return {
    fills: fill(outer, FILL2) + shade(outer, METAL) + fill(inner) + fill(prong, FILL2) + shade(prong, METAL),
    lines: ink(stroke(outer), stroke(inner), stroke(prong)),
    frame: outer,
  };
}

/* ------------------------------------------------------------------ */
/* Ribbons                                                              */
/* ------------------------------------------------------------------ */

/** Points along a cubic Bezier. */
export function sampleCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = lerp(lerp(p0, p1, t), lerp(p1, p2, t), t);
    const b = lerp(lerp(p1, p2, t), lerp(p2, p3, t), t);
    pts.push(lerp(a, b, t));
  }
  return pts;
}

/**
 * Catmull-Rom segments through `pts`, starting from `pts[0]` (which is not
 * emitted: pass it to `path()` as the start, or chain after other segments).
 * Repeat a point to make a corner. `close` wraps around to `pts[0]`.
 */
export function splineSegs(pts: readonly Pt[], close = false): Seg[] {
  const n = pts.length;
  const at = (i: number): Pt => pts[close ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  const segs: Seg[] = [];
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    segs.push(C(
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ));
  }
  return segs;
}

/** Path data through sampled points as a smooth Catmull-Rom spline (cubic segments). */
export function smooth(pts: readonly Pt[], close = false): string {
  return path(pts[0], splineSegs(pts, close), close);
}

/** Offsets of a spine: the points `w` to its right (+) or left (−) by the local normal. */
export function offsetPoints(spine: readonly Pt[], w: number): Pt[] {
  const n = spine.length;
  return spine.map((p, i) => {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / len) * w, p[1] + (dx / len) * w];
  });
}

export interface Ribbon {
  /** Closed outline of the band. */
  outline: string;
  /** The two long edges as open paths (left/right of the spine direction). */
  edgeA: string;
  edgeB: string;
  /** A line along the spine, offset by `k` of the half width (−1..1), for stitching. */
  along(k: number, trim?: number): string;
  /** A line across the band at the spine index `i` (for a cuff, a link, a stitch). */
  across(i: number, inset?: number): string;
  spine: readonly Pt[];
}

/** A band of width `w` centered on `spine`, with square ends. */
export function ribbon(spine: readonly Pt[], w: number): Ribbon {
  const a = offsetPoints(spine, -w / 2);
  const b = offsetPoints(spine, w / 2);
  return {
    outline: joinLoop(a, b),
    edgeA: smooth(a),
    edgeB: smooth(b),
    along: (k, trim = 0) => {
      const pts = offsetPoints(spine, (k * w) / 2);
      return smooth(pts.slice(trim, pts.length - trim));
    },
    across: (i, inset = 0) => {
      const p = offsetPoints(spine, -w / 2 + inset)[i];
      const q = offsetPoints(spine, w / 2 - inset)[i];
      return polyline(p, q);
    },
    spine,
  };
}

/** One closed smooth path: along `a`, then back along `b` reversed. */
function joinLoop(a: readonly Pt[], b: readonly Pt[]): string {
  const n = a.length;
  const pts: Pt[] = [...a, ...[...b].reverse()];
  // Smooth each long edge, join with straight ends.
  const segsOf = (p: readonly Pt[]): Seg[] => {
    const out: Seg[] = [];
    const at = (i: number) => p[Math.max(0, Math.min(p.length - 1, i))];
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = at(i - 1);
      const p1 = at(i);
      const p2 = at(i + 1);
      const p3 = at(i + 2);
      out.push(C(
        [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
        [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
        p2,
      ));
    }
    return out;
  };
  const bRev = pts.slice(n);
  return path(a[0], [...segsOf(a), L(bRev[0]), ...segsOf(bRev)], true);
}

/** A seam line parallel to an edge, `k` of the way across (for topstitching a strap). */
export const stitch = (r: Ribbon, k: number, trim = 1): string => seam(r.along(k, trim));

/* ------------------------------------------------------------------ */
/* Shoe anatomy                                                         */
/* ------------------------------------------------------------------ */

export interface Eyestay {
  /** The top edge a→b (where the tongue emerges), full ink. */
  top: string;
  /** The stitched lower edge of the stay, a seam. */
  bottom: string;
  /** Lace bars across the stay, for `ink()`: the edges of the bands, or thin lines when `laceW` is 0. */
  bars: string[];
  /** The lace bands' fills (second color), drawn before the ink. Empty for thin laces. */
  laceFills: string;
  /** The stay as a closed panel (for a colorblock). */
  panel: string;
  /** Ends of the bottom edge. */
  a2: Pt;
  b2: Pt;
  /** A point on the bottom edge, `t` of the way from the throat to the vamp. */
  bottomAt(t: number): Pt;
  /** A point on the top edge. */
  topAt(t: number): Pt;
}

/**
 * A laced eyestay: the strip `w` deep under the edge from the throat `a` to
 * the vamp `b`, with `count` lace bars leaning across it. `bow` lifts the
 * middle of the top edge (a sneaker's lace line is slightly convex). Laces
 * are flat bands `laceW` wide in the second color; 0 draws them as thin lines
 * (dress shoes).
 */
export function eyestay(a: Pt, b: Pt, w: number, count: number, bow = 0, t0 = 0.1, t1 = 0.9, laceW = 0): Eyestay {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const n: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const a2 = add(a, n, w);
  const b2 = add(b, n, w);
  const mid = (p: Pt, q: Pt, lift: number): Pt => add(lerp(p, q, 0.5), n, -lift);
  const top = path(a, [Q(mid(a, b, bow * 2), b)]);
  const bottom = path(a2, [Q(mid(a2, b2, bow * 1.4), b2)]);
  const panel = path(a, [Q(mid(a, b, bow * 2), b), L(b2), Q(mid(a2, b2, bow * 1.4), a2)], true);
  // A point on a bowed edge p→q at `t`, `inset` into the stay: the Q curve
  // deviates from the chord by 4·lift·t(1−t) along the normal.
  const on = (p: Pt, q: Pt, lift: number, t: number, inset: number): Pt =>
    add(lerp(p, q, t), n, inset - 4 * lift * t * (1 - t));
  const u: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const bars: string[] = [];
  const bands: string[] = [];
  const lean = 0.05;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : t0 + ((t1 - t0) * i) / (count - 1);
    const top = on(a, b, bow, t + lean, 1.2);
    const bot = on(a2, b2, bow * 0.7, t - lean, -1.2);
    if (laceW > 0) bands.push(laceBand(top, bot, u, laceW));
    else bars.push(stroke(polyline(top, bot)));
  }
  const lc = laces(bands);
  return {
    top,
    bottom,
    bars: laceW > 0 ? lc.lines : bars,
    laceFills: laceW > 0 ? lc.fills : "",
    panel,
    a2,
    b2,
    bottomAt: (t) => on(a2, b2, bow * 0.7, t, 0),
    topAt: (t) => on(a, b, bow, t, 0),
  };
}

/**
 * A sandal strap seen from the side: a band of thickness `w` rising from
 * the footbed at x = a and x = b, `h` high, with slanted sides and a
 * flat-ish top (`shoulder` is the run of each side). Returns the near edge,
 * the inner edge (through which the far side shows) and the band itself.
 */
export function strapArch(a: number, b: number, h: number, w: number, shoulder = 12): { outer: string; inner: string; band: string; inset: (k: number) => string } {
  const Y = GROUND;
  const edge = (x0: number, x1: number, top: number, s: number): Seg[] => {
    const r = Math.min(8, (x1 - x0) / 4);
    return [
      C([x0 + s * 0.45, top + (Y - top) * 0.5], [x0 + s * 0.8, top], [x0 + s + r, top]),
      L([x1 - s - r, top]),
      C([x1 - s * 0.8, top], [x1 - s * 0.45, top + (Y - top) * 0.5], [x1, Y]),
    ];
  };
  const outerSegs = edge(a, b, Y - h, shoulder);
  const slant = w * (shoulder / h) * 0.9;
  const ia = a + w + slant;
  const ib = b - w - slant;
  const ih = h - w;
  const innerSegs = edge(ia, ib, Y - ih, shoulder * (ih / h));
  const outer = path([a, Y], outerSegs);
  const inner = path([ia, Y], innerSegs);
  const band = path([a, Y], [...outerSegs, L([ib, Y]), ...reversed(innerSegs, [ia, Y])], true);
  const inset = (k: number) => {
    const ka = a + k * (1 + slant / w);
    return path([ka, Y], edge(ka, b - k * (1 + slant / w), Y - h + k, shoulder * ((h - k) / h)));
  };
  return { outer, inner, band, inset };
}

/** Segments reversed: walks `segs` (which started at `start`) backwards. */
export function reversed(segs: readonly Seg[], start: Pt): Seg[] {
  const out: Seg[] = [];
  let from = start;
  const ends: Pt[] = [];
  for (const s of segs) {
    ends.push(from);
    from = s[s.length - 1] as Pt;
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if (s[0] === "L") out.push(L(ends[i]));
    else if (s[0] === "Q") out.push(Q(s[1], ends[i]));
    else out.push(C(s[2], s[1], ends[i]));
  }
  return out;
}

/** Points along an ellipse arc from angle a0 to a1 (degrees, clockwise on screen). */
export function ellipseArc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 16): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}

/** Path data rotated by `deg` about (cx, cy). Absolute M/L/Q/C/Z only. */
export function rotated(d: string, deg: number, cx: number, cy: number): string {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return d.replace(/([MLQC])([^MLQCZ]+)/g, (_, cmd: string, nums: string) => {
    const v = nums.trim().split(/[\s,]+/).map(Number);
    const out: string[] = [];
    for (let i = 0; i < v.length; i += 2) {
      const x = v[i] - cx;
      const y = v[i + 1] - cy;
      out.push(`${num(cx + x * cos - y * sin)} ${num(cy + x * sin + y * cos)}`);
    }
    return cmd + out.join(" ");
  });
}

/** A point rotated by `deg` about (cx, cy). */
export function rotatePt([x, y]: Pt, deg: number, cx: number, cy: number): Pt {
  const r = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
}

/** Markup rotated by `deg` about (cx, cy): every path's data and every circle's center. */
export function rotateMarkup(markup: string, deg: number, cx: number, cy: number): string {
  return markup
    .replace(/ d="([^"]+)"/g, (_, d: string) => ` d="${rotated(d, deg, cx, cy)}"`)
    .replace(/<circle cx="([-\d.]+)" cy="([-\d.]+)"/g, (_, x: string, y: string) => {
      const [rx, ry] = rotatePt([Number(x), Number(y)], deg, cx, cy);
      return `<circle cx="${num(rx)}" cy="${num(ry)}"`;
    });
}
