/**
 * Shared parts for the outerwear and bottoms group.
 *
 * `jacket()` is the torso body for coats: the same proportions and curves as
 * `torso()`, but it also hands back the open `edge` (everything but the front
 * neckline) so a garment can draw its own neck: a zip into a stand collar,
 * notched lapels, a hood. The rest are the parts coats share: zips, pockets,
 * flaps, collars, belts, and one fit table so every jacket grows the same way.
 */
import {
  add,
  boundsOf,
  C,
  CX,
  dir,
  FILL,
  FILL2,
  fill,
  INK,
  ink,
  L,
  lerp,
  mirrored,
  num,
  path,
  perp,
  polyline,
  Q,
  seam,
  shade,
  stroke,
  symmetric,
  type Pt,
  type Seg,
} from "./draw";
import type { Neckline, TorsoSpec } from "./torso";
import type { ArtPanel, KitPiece } from "./types";

/* ------------------------------------------------------------------ */
/* Body                                                                 */
/* ------------------------------------------------------------------ */

export interface JacketSpec extends Omit<TorsoSpec, "neck" | "neckDepth"> {
  /** The front neckline from the center line up to the shoulder-neck point. */
  neck: Neckline;
  /** Radius of the rounded front corners at the hem (a blazer's cutaway). */
  cutaway?: number;
  /** Quilted sides: the body side bulges out between baffles `pitch` apart, by `depth`; `sleeves` quilts the sleeve edges too. */
  scallop?: { pitch: number; depth: number; sleeves?: boolean };
  /**
   * How far the inner cuff corner hangs out from the body side, in units.
   * When set, `sleeveAngle` is only a starting guess: the sleeve is turned
   * until its underarm edge lies along the body with this gap at the cuff,
   * so there is no wedge of background between a sleeve and the torso.
   */
  hang?: number;
  /**
   * A blouson body: the side bellies out to `waistW` and tucks sharply into
   * a hem band this deep, which is narrower than the body (a bomber). The
   * band's sides are straight; `hemBand(blouson)` is the band.
   */
  blouson?: number;
  /** How far the top edge of each sleeve bows outward at mid length. Default 1.5; a full sleeve 4. */
  sleeveBow?: number;
}

export interface Jacket {
  spec: JacketSpec;
  /** Closed silhouette (fill, clip). */
  outline: string;
  /** The silhouette as an open stroke, from the right neck point around to the left one. */
  edge: string;
  /** Shoulder-neck point, right side. */
  neckPoint: Pt;
  shoulder: Pt;
  armpit: Pt;
  cuffOuter: Pt;
  cuffInner: Pt;
  sleeveDir: Pt;
  /** y of the hem at the center. */
  hemY: number;
  armSeams: string;
  /** Raglan seams: from each armpit up to the neckline. */
  raglanSeams(): string;
  cuffLines(inset: number): string;
  cuffBand(depth: number): string;
  hemBand(depth: number): string;
  sleevePanel(): string;
  /** Path data of the right raglan sleeve (cuff to neckline), for colorblock and pattern panels. */
  raglanPanel(): string;
  /** A closed panel across the whole piece from the top down to `y` (a yoke colorblock; clipped by the garment). */
  yokePanel(y: number): string;
  /** Pattern panels for both sleeves: a field pattern turns to run along each sleeve. `raglan` uses the raglan panels. */
  panels(raglan?: boolean): ArtPanel[];
  hemLine(inset: number, margin?: number): string;
  bodyY(t: number): number;
  /** Half width of the body at `y` (between the armpit and the hem). */
  halfW(y: number): number;
  /** A line across the right sleeve, `d` units down its top edge from the shoulder tip. */
  sleeveLine(d: number): string;
  /** y of each baffle boundary on the body when `scallop` is set (armpit to hem). */
  baffles: number[];
  /** Distance along the sleeve of each baffle boundary when `scallop.sleeves` is set. */
  sleeveBaffles: number[];
}

/** The mirror image of a point about the center line. */
export const mirrorPt = ([x, y]: Pt): Pt => [2 * CX - x, y];

/** `symmetric()` without the closing segment: an open, mirrored stroke. */
function mirroredOpen(start: Pt, segs: readonly Seg[]): string {
  const m = ([x, y]: Pt): Pt => [2 * CX - x, y];
  const left: Seg[] = [];
  let from: Pt = start;
  const ends: Pt[] = [];
  for (const seg of segs) {
    ends.push(from);
    from = seg[seg.length - 1] as Pt;
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    const to = m(ends[i]);
    if (seg[0] === "L") left.push(["L", to]);
    else if (seg[0] === "Q") left.push(["Q", m(seg[1]), to]);
    else left.push(["C", m(seg[2]), m(seg[1]), to]);
  }
  return path(start, [...segs, ...left]);
}

export function jacket(input: JacketSpec): Jacket {
  const { neckW, neckY, shoulderW, shoulderDrop, chestW, hemW, length, armhole, sleeveLen, cuffW, neck } = input;
  const waistW = input.waistW ?? Math.min(chestW, hemW);
  const hemCurve = input.hemCurve ?? 0;
  const cutaway = input.cutaway ?? 0;

  const K: Pt = [CX + neckW, neckY];
  const S: Pt = [CX + shoulderW, neckY + shoulderDrop];
  const A: Pt = [CX + chestW, S[1] + armhole];
  const H: Pt = [CX + hemW, length];
  const hemMid: Pt = [CX, length + hemCurve];

  const blouson = input.blouson ?? 0;
  // Blouson: the belly ends here and tucks into the band over `tuck` units.
  const bandTop: Pt = [CX + hemW, length - blouson];
  const tuck = 7;
  const bellyEnd: Pt = [CX + waistW - 1.5, bandTop[1] - tuck];
  const halfW = (y: number) => {
    if (y <= A[1]) return chestW;
    if (y >= length) return hemW;
    if (blouson) {
      if (y >= bandTop[1]) return hemW;
      if (y >= bellyEnd[1]) return bellyEnd[0] - CX + (hemW - (bellyEnd[0] - CX)) * ((y - bellyEnd[1]) / tuck);
    }
    // The body side is a cubic; sample it.
    const p0 = A;
    const p1: Pt = blouson ? [CX + waistW, lerp(A, bellyEnd, 0.35)[1]] : [CX + waistW, lerp(A, H, 0.42)[1]];
    const p2: Pt = blouson ? [CX + waistW + 1, bellyEnd[1] - 10] : [CX + hemW - (hemW - waistW) * 0.25, lerp(A, H, 0.8)[1]];
    const p3 = blouson ? bellyEnd : H;
    let best = chestW;
    let bestD = Infinity;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = lerp(lerp(lerp(p0, p1, t), lerp(p1, p2, t), t), lerp(lerp(p1, p2, t), lerp(p2, p3, t), t), t);
      const d = Math.abs(a[1] - y);
      if (d < bestD) {
        bestD = d;
        best = a[0] - CX;
      }
    }
    return best;
  };
  const sleeveAngle =
    input.hang === undefined
      ? input.sleeveAngle
      : // A blouson sleeve hangs beside the belly, not tucked into the gathered hem.
        sleeveHang(S, sleeveLen, cuffW, (y) => CX + (blouson && y > A[1] ? Math.max(halfW(y), waistW - 1.5) : halfW(y)), input.hang, input.sleeveAngle);
  const spec: JacketSpec = { ...input, sleeveAngle };
  const u = dir(sleeveAngle);
  const v = perp(u);
  const Co = add(S, u, sleeveLen);
  const Ci = add(Co, v, cuffW);

  const baffles: number[] = [];
  let bodySide: Seg[];
  if (spec.scallop) {
    // Straight side split into bulges: one quadratic bump per baffle.
    const { pitch, depth } = spec.scallop;
    const n = Math.max(1, Math.round((H[1] - A[1]) / pitch));
    bodySide = [];
    for (let i = 1; i <= n; i++) {
      const p0 = lerp(A, H, (i - 1) / n);
      const p1 = lerp(A, H, i / n);
      baffles.push(p1[1]);
      bodySide.push(Q([lerp(p0, p1, 0.5)[0] + depth * 2, lerp(p0, p1, 0.5)[1]], p1));
    }
    baffles.pop();
  } else if (blouson) {
    // Belly out to the waist, tuck into the band, then the band's straight side.
    bodySide = [
      C([CX + waistW, lerp(A, bellyEnd, 0.35)[1]], [CX + waistW + 1, bellyEnd[1] - 10], bellyEnd),
      Q([CX + waistW - 3.5, bandTop[1] - 1], bandTop),
      L(H),
    ];
  } else {
    bodySide = [C([CX + waistW, lerp(A, H, 0.42)[1]], [CX + hemW - (hemW - waistW) * 0.25, lerp(A, H, 0.8)[1]], H)];
  }
  const hem: Seg[] = cutaway
    ? [L([CX + cutaway, length]), Q([CX, length], [CX, length - cutaway])]
    : hemCurve
      ? [Q([CX + hemW * 0.5, length + hemCurve], hemMid)]
      : [L(hemMid)];
  // Sleeve edges: one bowed segment each, or a run of bulges for a quilted sleeve.
  const sleeveBaffles: number[] = [];
  const bow = input.sleeveBow ?? 1.5;
  let sleeveTop: Seg[] = [Q(add(lerp(S, Co, 0.5), v, -bow), Co)];
  const underarm: Seg[] = [Q(add(lerp(Ci, A, 0.5), v, 1.5), A)];
  if (spec.scallop?.sleeves) {
    const { pitch, depth } = spec.scallop;
    const n = Math.max(1, Math.round(sleeveLen / pitch));
    sleeveTop = [];
    for (let i = 1; i <= n; i++) {
      const p0 = lerp(S, Co, (i - 1) / n);
      const p1 = lerp(S, Co, i / n);
      sleeveTop.push(Q(add(lerp(p0, p1, 0.5), v, -depth * 2), p1));
      if (i < n) sleeveBaffles.push((sleeveLen * i) / n);
    }
    // The underarm stays smooth so the sleeve and body bulges do not meet in a zigzag.
  }
  const segs: Seg[] = [
    Q([CX + neckW + (shoulderW - neckW) * 0.55, neckY + shoulderDrop * 0.25], S),
    ...sleeveTop,
    L(Ci),
    ...underarm,
    ...bodySide,
    ...hem,
  ];
  const outline = symmetric(neck.start, [...neck.segs, ...segs]);
  const edge = mirroredOpen(K, segs);

  const armSeam = path(S, [C([S[0] - 1, lerp(S, A, 0.4)[1]], [A[0] + 3, A[1] - armhole * 0.22], A)]);
  const raglan = path(A, [C([A[0] - 2, A[1] - armhole * 0.5], [CX + neckW + 6, neckY + 6], [CX + neckW + 2.5, neckY + 1.2])]);
  const cuffStitch = (inset: number) => polyline(add(Co, u, -inset), add(Ci, u, -inset));
  const hemLine = (inset: number, margin = 2) => {
    const l: Pt = [CX - hemW + margin, length - inset];
    const r: Pt = [CX + hemW - margin, length - inset];
    if (!hemCurve) return polyline(l, r);
    return path(l, [Q([CX, length + hemCurve - inset], r)]);
  };
  const both = (d: string) => seam(d) + seam(mirrored(d));
  const cuffBand = (depth: number) => path(add(Co, u, -depth), [L(Co), L(Ci), L(add(Ci, u, -depth))], true);
  const hemBand = (depth: number) =>
    symmetric([CX, length - depth + hemCurve], [
      hemCurve ? Q([CX + hemW * 0.5, length - depth + hemCurve], [CX + hemW, length - depth]) : L([CX + hemW, length - depth]),
      L(H),
      hemCurve ? Q([CX + hemW * 0.5, length + hemCurve], hemMid) : L(hemMid),
    ]);
  const sleevePanel = () =>
    path(S, [Q(add(lerp(S, Co, 0.5), v, -bow), Co), L(Ci), Q(add(lerp(Ci, A, 0.5), v, 1.5), A), C([A[0] + 3, A[1] - armhole * 0.22], [S[0] - 1, lerp(S, A, 0.4)[1]], S)], true);
  const yokePanel = (y: number) => path([CX - 120, neckY - 80], [L([CX + 120, neckY - 80]), L([CX + 120, y]), L([CX - 120, y])], true);
  const raglanPanel = () =>
    path([CX + neckW + 2.5, neckY + 1.2], [
      Q([CX + neckW + (shoulderW - neckW) * 0.55, neckY + shoulderDrop * 0.25], S),
      Q(add(lerp(S, Co, 0.5), v, -bow), Co),
      L(Ci),
      Q(add(lerp(Ci, A, 0.5), v, 1.5), A),
      C([A[0] - 2, A[1] - armhole * 0.5], [CX + neckW + 6, neckY + 6], [CX + neckW + 2.5, neckY + 1.2]),
    ], true);
  const panels = (raglan = false): ArtPanel[] => {
    const right = raglan ? raglanPanel() : sleevePanel();
    return sleevePanelsOf(right, sleeveAngle);
  };
  // A line across the sleeve: from the top edge straight across (along v) to the underarm line A–Ci.
  const sleeveLine = (d: number) => {
    const T = add(S, u, d);
    const r: Pt = [Ci[0] - A[0], Ci[1] - A[1]];
    const den = v[0] * r[1] - v[1] * r[0];
    const w: Pt = [A[0] - T[0], A[1] - T[1]];
    const sParam = den === 0 ? 0 : (w[0] * r[1] - w[1] * r[0]) / den;
    return polyline(add(T, v, 0.5), add(T, v, sParam - 0.5));
  };

  return {
    spec,
    outline,
    edge,
    neckPoint: K,
    sleeveLine,
    baffles,
    sleeveBaffles,
    shoulder: S,
    armpit: A,
    cuffOuter: Co,
    cuffInner: Ci,
    sleeveDir: u,
    hemY: length + hemCurve,
    armSeams: both(armSeam),
    raglanSeams: () => both(raglan),
    cuffLines: (inset) => both(cuffStitch(inset)),
    cuffBand,
    hemBand,
    sleevePanel,
    raglanPanel,
    yokePanel,
    panels,
    hemLine,
    bodyY: (t) => A[1] + (length - A[1]) * t,
    halfW,
  };
}

/* ------------------------------------------------------------------ */
/* Sleeves                                                              */
/* ------------------------------------------------------------------ */

/**
 * The sleeve angle (degrees below horizontal) at which a sleeve from the
 * shoulder tip `S`, `len` long and `cuffW` across the cuff, hangs with its
 * inner cuff corner `gap` units outside the body side (`bodyX(y)` is the
 * body's right edge at `y`). Flat-lay sleeves lie along the torso; a sleeve
 * turned out further leaves a wedge of background between it and the body,
 * and one turned in further tucks under it. `guess` seeds the search.
 */
export function sleeveHang(S: Pt, len: number, cuffW: number, bodyX: (y: number) => number, gap: number, guess = 76): number {
  const innerX = (deg: number) => {
    const u = dir(deg);
    const ci = add(add(S, u, len), perp(u), cuffW);
    return ci[0] - (bodyX(ci[1]) + gap);
  };
  // innerX falls as the sleeve turns in; bisect on [guess - 15, guess + 15].
  let lo = guess - 15;
  let hi = guess + 15;
  if (innerX(lo) < 0) return lo;
  if (innerX(hi) > 0) return hi;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (innerX(mid) > 0) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 10) / 10;
}

/**
 * Pattern panels for a pair of sleeves from the right sleeve's path and the
 * sleeve angle: a field pattern turns by the sleeve's lean from vertical on
 * each side, so stripes and checks run along the arm instead of straight
 * across it.
 */
export function sleevePanelsOf(right: string, sleeveAngle: number): ArtPanel[] {
  const left = mirrored(right);
  const lean = Math.round((sleeveAngle - 90) * 10) / 10;
  const box = (d: string) => boundsOf([d]).map((n) => Math.round(n * 10) / 10) as unknown as ArtPanel["box"];
  return [
    { clip: right, box: box(right), angle: lean },
    { clip: left, box: box(left), angle: -lean },
  ];
}

/** Attaches pattern panels to a built piece. */
export function withPanels(p: KitPiece, panels: readonly ArtPanel[]): KitPiece {
  p.layers.panels = panels;
  return p;
}

/* ------------------------------------------------------------------ */
/* Fits                                                                 */
/* ------------------------------------------------------------------ */

/** The regular-fit numbers every jacket starts from; garments override length and sleeve. */
export const JACKET_BASE: Omit<JacketSpec, "neck"> = {
  neckW: 15,
  neckY: 22,
  shoulderW: 60,
  shoulderDrop: 9,
  chestW: 58,
  hemW: 56,
  length: 168,
  armhole: 33,
  sleeveLen: 118,
  cuffW: 24,
  sleeveAngle: 75,
  hang: 2.5,
};

type Dims = Omit<JacketSpec, "neck">;
/**
 * One fit table for all outerwear, applied as deltas so a short jacket and a
 * long coat change by the same amounts: fitted narrows the body and pulls in
 * a waist, relaxed widens, oversized drops the shoulders and lengthens.
 */
export function outerFit<T extends Dims>(base: T, fit: string): T {
  switch (fit) {
    case "fitted":
      return {
        ...base,
        shoulderW: base.shoulderW - 4,
        chestW: base.chestW - 5,
        waistW: base.chestW - 10,
        hemW: base.hemW - 5,
        length: base.length - 4,
        armhole: base.armhole - 3,
        sleeveLen: base.sleeveLen - 4,
        cuffW: base.cuffW - 2,
        sleeveAngle: base.sleeveAngle + 2,
      };
    case "relaxed":
      return {
        ...base,
        shoulderW: base.shoulderW + 4,
        chestW: base.chestW + 5,
        hemW: base.hemW + 5,
        length: base.length + 4,
        armhole: base.armhole + 3,
        cuffW: base.cuffW + 2,
      };
    case "oversized":
      return {
        ...base,
        shoulderW: base.shoulderW + 14,
        shoulderDrop: base.shoulderDrop + 4,
        chestW: base.chestW + 15,
        hemW: base.hemW + 15,
        length: base.length + 16,
        armhole: base.armhole + 10,
        sleeveLen: base.sleeveLen + 6,
        cuffW: base.cuffW + 6,
        sleeveAngle: base.sleeveAngle - 2,
      };
    default:
      return { ...base };
  }
}

/** Builds the `typeId@fit` table (plus the bare default key) for a garment. */
export function fitTable<T>(typeId: string, fits: readonly string[], defaultFit: string, build: (fit: string) => T): Record<string, T> {
  const out: Record<string, T> = Object.fromEntries(fits.map((f) => [`${typeId}@${f}`, build(f)]));
  out[typeId] = out[`${typeId}@${defaultFit}`];
  return out;
}

/* ------------------------------------------------------------------ */
/* Rib trims                                                            */
/* ------------------------------------------------------------------ */

/** Opacity of the knit lines inside a rib band: lighter than a seam, so the band reads as texture. */
export const RIB = 0.32;
/** Spacing of rib lines, in units: coarse enough to separate at 56 px. */
const RIB_PITCH = 3.4;

/** The rib lines across a hem band `depth` deep: one stroke item for an `ink()` group. */
export function ribHem(j: Jacket, depth: number, pitch = RIB_PITCH): string {
  const { hemW, length } = j.spec;
  const y0 = length - depth + 1.2;
  const y1 = j.hemY - 1.2;
  const n = Math.floor((2 * hemW - 4) / pitch);
  const x0 = CX - ((n - 1) * pitch) / 2;
  let d = "";
  for (let i = 0; i < n; i++) d += polyline([x0 + i * pitch, y0], [x0 + i * pitch, y1]);
  return stroke(d, RIB);
}

/** The rib lines along both cuff bands `depth` deep: one stroke item for an `ink()` group. */
export function ribCuffs(j: Jacket, depth: number, pitch = RIB_PITCH): string {
  const { cuffW } = j.spec;
  const u = j.sleeveDir;
  const v = perp(u);
  const n = Math.floor((cuffW - 3) / pitch);
  const k0 = (cuffW - (n - 1) * pitch) / 2;
  let d = "";
  for (let i = 0; i < n; i++) {
    const at = add(j.cuffOuter, v, k0 + i * pitch);
    d += polyline(add(at, u, -depth + 1.2), add(at, u, -1.2));
  }
  return stroke(d, RIB) + stroke(mirrored(d), RIB);
}

/**
 * Gathers above a blouson's hem band: short folds where the full body is
 * drawn onto the narrower rib, `n` each side. One seam item for `ink()`.
 */
export function gathers(j: Jacket, depth: number, n = 3, rise = 7): string {
  const { hemW, length } = j.spec;
  const y1 = length - depth - 0.5;
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = CX + hemW * (0.22 + (0.66 * i) / Math.max(1, n - 1));
    const lean = (x - CX) / hemW;
    d += path([x + lean * 1.5, y1 - rise], [Q([x + lean * 0.3, y1 - rise * 0.35], [x, y1])]);
  }
  return seam(d) + seam(mirrored(d));
}

/* ------------------------------------------------------------------ */
/* Necklines                                                            */
/* ------------------------------------------------------------------ */

/** A shallow round neckline under a stand collar or a hood. */
export function roundNeck(neckW: number, neckY: number, depth: number): Neckline {
  return { start: [CX, neckY + depth], segs: [C([CX + neckW * 0.55, neckY + depth], [CX + neckW, neckY + depth * 0.55], [CX + neckW, neckY])] };
}

/* ------------------------------------------------------------------ */
/* Hardware                                                             */
/* ------------------------------------------------------------------ */

/**
 * A zip from (x, y0) down to (x, y1): the teeth as one full line, the tape
 * stitching either side, and a slider at the top. Returns the stroke items
 * (for an `ink()` group) and the slider markup (drawn after the ink).
 */
export function zip(x: number, y0: number, y1: number, opts: { tape?: number; slider?: boolean; single?: boolean } = {}): { strokes: string; slider: string } {
  return zipBetween([x, y0], [x, y1], opts);
}

/** A zip from `a` (the slider end) to `b`, at any angle. */
export function zipBetween(a: Pt, b: Pt, opts: { tape?: number; slider?: boolean; single?: boolean } = {}): { strokes: string; slider: string } {
  const tape = opts.tape ?? 3.2;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n = perp(u);
  // `single` keeps only the lower tape: a pocket zip reads with two lines.
  const strokes =
    stroke(polyline(a, b)) +
    (opts.single ? "" : seam(polyline(add(add(a, u, 1), n, -tape), add(add(b, u, -1), n, -tape)))) +
    seam(polyline(add(add(a, u, 1), n, tape), add(add(b, u, -1), n, tape)));
  const angle = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  const at = add(a, u, 2);
  return { strokes, slider: opts.slider === false ? "" : zipSlider(at[0], at[1], angle) };
}

/** A zip slider: a small rounded tab centered at (x, y). */
export function zipSlider(x: number, y: number, angle = 90): string {
  const u = dir(angle);
  const v = perp(u);
  const w = 1.7;
  const h = 3;
  const a = add(add([x, y], u, -h), v, -w);
  const b = add(add([x, y], u, -h), v, w);
  const d = add(add([x, y], u, h), v, -w);
  const tip = add([x, y], u, h + 1.2);
  const r = path(a, [L(b), Q(add(tip, v, w), add(tip, v, w * 0.2)), L(add(tip, v, -w * 0.2)), Q(add(tip, v, -w), d)], true);
  return `<path d="${r}" fill="${FILL2}" stroke="${INK}" stroke-width="1" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
}

/** A column of buttons on x from y0 to y1 (inclusive of y0), `step` apart. */
export function buttons(x: number, y0: number, y1: number, step: number, r = 1.9): string {
  let out = "";
  for (let y = y0; y <= y1 + 0.01; y += step) out += buttonAt(x, y, r);
  return out;
}

/** The kit's button, as in `draw.ts` (duplicated here so a snap can be plain fill). */
export function buttonAt(cx: number, cy: number, r: number, paint: string = FILL2): string {
  return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="${paint}" stroke="${INK}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
}

/* ------------------------------------------------------------------ */
/* Pockets                                                              */
/* ------------------------------------------------------------------ */

/**
 * A patch pocket with its top-left corner at (x, y). Stitched sides and
 * bottom at seam opacity, the opening in full ink. Returns ink items.
 */
export function patchPocket(x: number, y: number, w: number, h: number, opts: { round?: number; point?: number } = {}): string {
  const r = opts.round ?? 2;
  const pt = opts.point ?? 0;
  const body = pt
    ? path([x, y], [L([x, y + h - pt]), L([x + w / 2, y + h]), L([x + w, y + h - pt]), L([x + w, y])])
    : path([x, y], [L([x, y + h - r]), Q([x, y + h], [x + r, y + h]), L([x + w - r, y + h]), Q([x + w, y + h], [x + w, y + h - r]), L([x + w, y])]);
  return seam(body) + stroke(polyline([x, y], [x + w, y]));
}

/**
 * A pocket flap with its top edge from (x, y) to (x + w, y): its free edges in
 * full ink, its top as a seam. `point` > 0 makes a pointed (western) flap.
 */
export function flap(x: number, y: number, w: number, d: number, point = 0): { fill: string; lines: string } {
  const r = 1.5;
  const d0 = path([x, y], point
    ? [L([x, y + d - point]), L([x + w / 2, y + d]), L([x + w, y + d - point]), L([x + w, y])]
    : [L([x, y + d - r]), Q([x, y + d], [x + r, y + d]), L([x + w - r, y + d]), Q([x + w, y + d], [x + w, y + d - r]), L([x + w, y])], true);
  const free = point
    ? path([x, y], [L([x, y + d - point]), L([x + w / 2, y + d]), L([x + w, y + d - point]), L([x + w, y])])
    : path([x, y], [L([x, y + d - r]), Q([x, y + d], [x + r, y + d]), L([x + w - r, y + d]), Q([x + w, y + d], [x + w, y + d - r]), L([x + w, y])]);
  return { fill: fill(d0), lines: stroke(free) + seam(polyline([x + 0.5, y], [x + w - 0.5, y])) };
}

/**
 * A slanted flap pocket: a parallelogram flap whose top edge runs from `a` to
 * `b`, `d` deep, free edges in full ink. Returns fill and ink.
 */
export function slantFlap(a: Pt, b: Pt, d: number): { fill: string; lines: string } {
  const a2: Pt = [a[0], a[1] + d];
  const b2: Pt = [b[0], b[1] + d];
  const shape = path(a, [L(b), L(b2), L(a2)], true);
  return { fill: fill(shape), lines: stroke(path(a, [L(a2), L(b2), L(b)])) + seam(polyline(a, b)) };
}

/**
 * A slanted welt (jetted) pocket: the opening from `a` to `b` in full ink with
 * the welt's lower stitch beside it. Returns ink items.
 */
export function weltPocket(a: Pt, b: Pt, depth = 3.2): string {
  const u: Pt = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(u[0], u[1]);
  const n = perp([u[0] / len, u[1] / len]);
  const a2 = add(a, n, depth);
  const b2 = add(b, n, depth);
  return stroke(polyline(a, b)) + seam(polyline(a2, b2)) + seam(polyline(a, a2)) + seam(polyline(b, b2));
}

/* ------------------------------------------------------------------ */
/* Collars                                                              */
/* ------------------------------------------------------------------ */

/**
 * A stand collar around a neck of half width `w` on the shoulder line `y`,
 * rising `h` above it. The inside of the collar shows through the neck hole.
 * `paint` is the collar's fabric, `lining` what shows inside (default: the
 * fabric, shaded). Returns fills and ink; `baseY` is where the collar meets
 * the body at the center front.
 */
export function standCollar(
  w: number,
  y: number,
  h: number,
  opts: { paint?: string; lining?: string; rib?: boolean } = {},
): { fills: string; lines: string; baseY: number; holeY: number } {
  const paint = opts.paint ?? FILL;
  const outW = w + 5;
  const top = y - h;
  const baseY = y + 1 + h;
  const t = Math.min(5, h * 0.55);
  const holeTop = top + t;
  const holeY = y + 1;
  const holeW = outW - t;
  const sideTop = y + 2;
  const outer = symmetric([CX, top], [
    C([CX + outW * 0.55, top], [CX + outW, top + (sideTop - top) * 0.5], [CX + outW, sideTop]),
    L([CX + outW, baseY - 1.5]),
    Q([CX + outW, baseY], [CX + outW - 1.5, baseY]),
    L([CX, baseY]),
  ]);
  const hole = symmetric([CX, holeTop], [
    C([CX + holeW * 0.55, holeTop], [CX + holeW, holeTop + (holeY - holeTop) * 0.5], [CX + holeW, holeY]),
    L([CX, holeY]),
  ]);
  const sides = path([CX - outW + 1.5, baseY], [
    Q([CX - outW, baseY], [CX - outW, baseY - 1.5]),
    L([CX - outW, sideTop]),
    C([CX - outW, top + (sideTop - top) * 0.5], [CX - outW * 0.55, top], [CX, top]),
    C([CX + outW * 0.55, top], [CX + outW, top + (sideTop - top) * 0.5], [CX + outW, sideTop]),
    L([CX + outW, baseY - 1.5]),
    Q([CX + outW, baseY], [CX + outW - 1.5, baseY]),
  ]);
  const lining = opts.lining ? fill(hole, opts.lining) + shade(hole, 0.12) : fill(hole) + shade(hole, 0.26);
  const base = polyline([CX - outW + 1.5, baseY], [CX + outW - 1.5, baseY]);
  // A rib knit collar: vertical knit lines across its face, around the hole.
  let rib = "";
  if (opts.rib) {
    const topAt = (x: number) => {
      // y of the collar's top edge at |x|: sample the top cubic.
      const ax = Math.abs(x - CX);
      let best = top;
      let bestD = Infinity;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const p = lerp(lerp(lerp([CX, top], [CX + outW * 0.55, top], t), lerp([CX + outW * 0.55, top], [CX + outW, top + (sideTop - top) * 0.5], t), t), lerp(lerp([CX + outW * 0.55, top], [CX + outW, top + (sideTop - top) * 0.5], t), lerp([CX + outW, top + (sideTop - top) * 0.5], [CX + outW, sideTop], t), t), t);
        const d = Math.abs(p[0] - CX - ax);
        if (d < bestD) {
          bestD = d;
          best = p[1];
        }
      }
      return best;
    };
    const n = Math.floor((2 * outW - 4) / RIB_PITCH);
    const x0 = CX - ((n - 1) * RIB_PITCH) / 2;
    let d = "";
    for (let i = 0; i < n; i++) {
      const x = x0 + i * RIB_PITCH;
      const y0 = Math.abs(x - CX) < holeW - 1 ? holeY + 1.2 : topAt(x) + 1.2;
      if (baseY - 1.2 - y0 > 1.5) d += polyline([x, y0], [x, baseY - 1.2]);
    }
    rib = stroke(d, RIB);
  }
  return {
    fills: fill(outer, paint) + lining,
    lines: ink(stroke(sides), seam(base), stroke(hole), rib),
    baseY,
    holeY,
  };
}

export interface LapelSpec {
  neckW: number;
  neckY: number;
  /** y where the lapels meet at the center front (the top button). */
  breakY: number;
  /** Half width of the lapel at its widest (the point). */
  lapelW: number;
  /** y of the lapel point. */
  pointY: number;
  /** Depth of the notch, along the gorge. */
  notch?: number;
  /** Peak lapels (the point sweeps up past the collar) instead of notched. */
  peak?: boolean;
  /** How far the collar reaches past the neck at the shoulder line. Default 6. */
  collarW?: number;
}

/**
 * Notched (or peaked) lapels with their collar. Returns the body `neck`
 * (so the opening is cut from the silhouette), the collar fills, and the ink
 * for the lapel edges, the collar and the roll line.
 */
export function lapels(s: LapelSpec): { neck: Neckline; fills: string; lines: string } {
  const { neckW, neckY, breakY, lapelW, pointY } = s;
  const notch = s.notch ?? 7;
  const B: Pt = [CX, breakY];
  const P: Pt = [CX + lapelW, pointY];
  // Gorge: the notch corner, up and in from the lapel point.
  const N: Pt = s.peak ? [CX + lapelW - notch * 1.1, pointY - notch * 0.35] : [CX + lapelW - notch, pointY - notch * 0.7];
  const K: Pt = [CX + neckW, neckY];
  // Lapel edge: a gentle curve from the break to the point.
  const edge = C([CX + lapelW * 0.25, breakY - (breakY - pointY) * 0.2], [CX + lapelW * 0.95, pointY + (breakY - pointY) * 0.25], P);
  const neck: Neckline = { start: B, segs: [edge, L(N), L(K)] };
  // Collar: the back folded over above the shoulder line, and its leaves
  // coming down to the notch.
  const back = neckW + (s.collarW ?? 6);
  const apexY = neckY - 7 - Math.max(0, (s.collarW ?? 6) - 6) * 0.4;
  const foldEnd: Pt = [CX + back, neckY + 1];
  const collarPoint: Pt = s.peak ? [CX + back - 2, neckY + 9] : [CX + back + 3, pointY - notch * 1.35];
  const collarBack = symmetric([CX, apexY], [C([CX + back * 0.55, apexY], [CX + back, neckY - 4], foldEnd), L([CX, neckY + 2])]);
  const leaf = path(foldEnd, [Q([CX + back + 1.5, lerp(foldEnd, collarPoint, 0.5)[1]], collarPoint), L(N), L(K), Q([CX + neckW + (back - neckW) * 0.5, neckY - 0.5], foldEnd)], true);
  const leafEdge = path(foldEnd, [Q([CX + back + 1.5, lerp(foldEnd, collarPoint, 0.5)[1]], collarPoint), L(N)]);
  const collarTop = path([CX - back, neckY + 1], [C([CX - back, neckY - 4], [CX - back * 0.55, apexY], [CX, apexY]), C([CX + back * 0.55, apexY], [CX + back, neckY - 4], foldEnd)]);
  // The inside of the coat, seen through the V.
  const inside = symmetric(B, [edge, L(N), L(K), L([CX, neckY + 2])]);
  // Roll line: where the lapel folds, from the break up to the neck.
  const roll = path(B, [Q([CX + neckW * 0.45, breakY - (breakY - neckY) * 0.55], K)]);
  const lapelEdge = path(B, [edge, L(N)]);
  // Fold between the collar back and its leaves, along the shoulder line.
  const fold = path([CX - back, neckY + 1], [Q([CX - neckW - (back - neckW) * 0.5, neckY - 0.5], [CX - neckW, neckY]), L([CX, neckY + 2]), L(K), Q([CX + neckW + (back - neckW) * 0.5, neckY - 0.5], foldEnd)]);
  return {
    neck,
    fills: fill(inside) + shade(inside, 0.22) + fill(collarBack) + fill(leaf) + fill(mirrored(leaf)),
    lines: ink(
      stroke(lapelEdge),
      stroke(mirrored(lapelEdge)),
      seam(roll),
      seam(mirrored(roll)),
      stroke(collarTop),
      stroke(fold),
      stroke(leafEdge),
      stroke(mirrored(leafEdge)),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Hood                                                                 */
/* ------------------------------------------------------------------ */

/**
 * A hood lying flat behind the shoulders, its opening facing the viewer. The
 * back of the hood is a dome rising from just behind the shoulder line; the
 * opening is one tall arch, continuous with the body's neckline, through
 * which the lining shows. `w` is the neck half width, `y` the shoulder line,
 * `wide` how far the hood spreads past the neck on each side, `depth` the
 * neckline's depth below the shoulder line. Returns the back (a fabric fill,
 * drawn under the body), the lining (drawn above it), the center seam of the
 * two-panel back, and the apex y.
 */
export function hood(w: number, y: number, wide: number, depth: number): { back: string; lining: string; seam: string; apex: number } {
  const foot = w + wide;
  const h = 30 + foot * 0.4; // height of the dome above the shoulder line
  const apex = y - h;
  const back = symmetric([CX, apex], [
    C([CX + foot * 0.66, apex], [CX + foot, apex + h * 0.42], [CX + foot, y + 6]),
    L([CX, y + 6]),
  ]);
  // The opening: the neckline, then the hood's front edges swelling out past
  // the neck and closing in a rounded top, a tulip gathered at the drawstring.
  const a = h * 0.68;
  const aw = w * 1.2;
  const lining = symmetric([CX, y + depth], [
    C([CX + w * 0.55, y + depth], [CX + w, y + depth * 0.55], [CX + w, y]),
    C([CX + w, y - a * 0.32], [CX + aw, y - a * 0.3], [CX + aw, y - a * 0.6]),
    C([CX + aw, y - a * 0.86], [CX + aw * 0.55, y - a], [CX, y - a]),
  ]);
  return { back, lining, seam: polyline([CX, apex + 0.5], [CX, y - a - 0.5]), apex };
}

/* ------------------------------------------------------------------ */
/* Belts and straps                                                     */
/* ------------------------------------------------------------------ */

/**
 * A fabric belt across the body at `y`, `halfW` wide: the band, a buckle a
 * little right of center and a short tail through it. Returns fills and ink.
 */
export function belt(y: number, halfW: number, h = 7): { fills: string; lines: string } {
  const band = path([CX - halfW - 0.5, y], [L([CX + halfW + 0.5, y]), L([CX + halfW + 0.5, y + h]), L([CX - halfW - 0.5, y + h])], true);
  const bx = CX + 5;
  const frame = path([bx - 2.4, y - 1.4], [L([bx + 2.4, y - 1.4]), L([bx + 2.4, y + h + 1.4]), L([bx - 2.4, y + h + 1.4])], true);
  const tailEnd = bx + 17;
  const tail = path([bx + 2.4, y + 1.2], [L([tailEnd - 2, y + 1.2]), Q([tailEnd, y + 1.2], [tailEnd, y + 3.2]), L([tailEnd, y + h - 3.2]), Q([tailEnd, y + h - 1.2], [tailEnd - 2, y + h - 1.2]), L([bx + 2.4, y + h - 1.2])], true);
  return {
    fills: fill(band) + fill(tail) + shade(tail, 0.08),
    lines: ink(stroke(band), stroke(tail), stroke(frame), seam(polyline([bx, y - 1.4], [bx, y + h + 1.4]))),
  };
}

/** An epaulette along each shoulder: a strap from the sleeve head to the neck with a button. */
export function epaulettes(j: Jacket): { fills: string; lines: string } {
  const { neckW, neckY, shoulderW, shoulderDrop } = j.spec;
  const from: Pt = [CX + shoulderW - 5, neckY + shoulderDrop * 0.86 + 0.6];
  const to: Pt = [CX + neckW + 7, neckY + 2.4];
  const u: Pt = [(to[0] - from[0]) / Math.hypot(to[0] - from[0], to[1] - from[1]), (to[1] - from[1]) / Math.hypot(to[0] - from[0], to[1] - from[1])];
  const n = perp(u);
  const w = 2.6;
  const strap = path(add(from, n, -w), [L(add(add(to, u, -3), n, -w)), L(add(to, n, -w * 0.3)), L(add(to, n, w * 0.3)), L(add(add(to, u, -3), n, w)), L(add(from, n, w))], true);
  const btn = add(to, u, -4.5);
  return {
    fills: fill(strap) + fill(mirrored(strap)),
    lines: ink(stroke(strap), stroke(mirrored(strap))) + buttonAt(btn[0], btn[1], 1.4) + buttonAt(2 * CX - btn[0], btn[1], 1.4),
  };
}

/** A sleeve strap across each cuff, `inset` above the cuff edge, with a small buckle. */
export function cuffStraps(j: Jacket, inset: number): string {
  const u = j.sleeveDir;
  const a = add(j.cuffOuter, u, -inset);
  const b = add(j.cuffInner, u, -inset);
  const w = 2.4;
  const strap = path(add(a, u, -w), [L(add(b, u, -w)), L(add(b, u, w)), L(add(a, u, w))], true);
  const m = lerp(a, b, 0.62);
  const buckle = path(add(add(m, u, -w - 1), perp(u), -1.6), [L(add(add(m, u, w + 1), perp(u), -1.6)), L(add(add(m, u, w + 1), perp(u), 1.6)), L(add(add(m, u, -w - 1), perp(u), 1.6))], true);
  return ink(seam(strap), seam(mirrored(strap)), stroke(buckle), stroke(mirrored(buckle)));
}

/* ------------------------------------------------------------------ */
/* Drawcords                                                            */
/* ------------------------------------------------------------------ */

/** A drawcord channel across the body at `y` (one seam) with the cord ends hanging at the center. */
export function drawcord(y: number, halfW: number, hang = 12, at = 4): string {
  const channel = seam(polyline([CX - halfW + 2, y], [CX + halfW - 2, y]));
  const cord = (k: number) => stroke(path([CX + at * k, y + 1], [C([CX + (at + 0.5) * k, y + hang * 0.5], [CX + (at + 2) * k, y + hang * 0.7], [CX + (at + 3) * k, y + hang])]));
  return channel + cord(1) + cord(-1);
}
