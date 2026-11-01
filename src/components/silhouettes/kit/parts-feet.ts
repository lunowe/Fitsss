/**
 * Shared parts for footwear and accessories: soles that share one ground
 * line and toe spring, lacing, metal hardware, and a smooth ribbon for
 * straps and scarves. Every shoe is a side view with the toe to the right;
 * the upper meets the sole at `GROUND` and the toe lifts off it by `spring`.
 */
import { C, FILL2, fill, ink, INK, L, lerp, num, path, polyline, Q, seam, shade, stroke, type Pt, type Seg } from "./draw";

/** y where an upper meets its sole. */
export const GROUND = 118;

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
    fills.push(shade(out, 0.18));
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

/**
 * Lace bars across an eyestay from its top edge (`a0`→`a1`) to its bottom
 * edge (`b0`→`b1`), `count` of them, each leaning like the reference sneaker.
 */
export function laceBars(a0: Pt, a1: Pt, b0: Pt, b1: Pt, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const top = lerp(a0, a1, t + 0.035);
    const bot = lerp(b0, b1, t - 0.035);
    out.push(stroke(polyline(top, bot)));
  }
  return out;
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

/** A frame buckle `w`×`h` with its prong, centered at (cx, cy); the strap runs left to right. */
export function buckle(cx: number, cy: number, w: number, h: number, bar = 2.6): { fills: string; lines: string; frame: string } {
  const outer = roundRect(cx - w / 2, cy - h / 2, w, h, 2.2);
  const inner = roundRect(cx - w / 2 + bar, cy - h / 2 + bar, w - 2 * bar, h - 2 * bar, 1);
  const prong = polyline([cx - w / 2 + bar * 0.5, cy], [cx + w / 2 - bar * 0.4, cy]);
  return {
    fills: fill(outer, FILL2) + shade(outer, METAL),
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

/** Path data through sampled points as a smooth Catmull-Rom spline (cubic segments). */
export function smooth(pts: readonly Pt[], close = false): string {
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
  return path(pts[0], segs, close);
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
