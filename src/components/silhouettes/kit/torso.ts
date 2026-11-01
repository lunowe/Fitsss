/**
 * The shared body for every top: a torso with two sleeves as one silhouette,
 * plus the seams that go with it. Garment modules describe a fit as numbers
 * (`TorsoSpec`), get the geometry back (`Torso`) and add their own neckline,
 * trims and details on top.
 *
 * Short sleeves stick out from the body and meet it at the armpit. Long
 * sleeves can lie *over* the body's side the way a flat-laid sweater's do
 * (`sleeveW` wider than the shoulder-to-armpit span, `hang` to turn the
 * sleeve until its cuff rests beside the body): the sleeve is then its own
 * shape on top of the body, the body's side shows only below it, and the
 * sleeve casts a soft shadow where it lies on the fabric.
 *
 * Half widths are measured from the center line x = 100; y grows downwards.
 */
import {
  add,
  C,
  CX,
  dir,
  L,
  lerp,
  mirrored,
  path,
  perp,
  polyline,
  Q,
  seam,
  shade,
  symmetric,
  type Pt,
  type Seg,
} from "./draw";
import { sleeveHang, sleevePanelsOf } from "./parts-outer";
import type { ArtPanel } from "./types";

export interface TorsoSpec {
  /** Half width of the neck opening where it meets the shoulder line. */
  neckW: number;
  /** y of the shoulder line at the neck. */
  neckY: number;
  /** Half width at the shoulder tips. */
  shoulderW: number;
  /** How far the shoulder tips sit below the neck (shoulder slope). */
  shoulderDrop: number;
  /** Half width of the body at the armpit. */
  chestW: number;
  /** Half width at the waist; narrower than `chestW` for a fitted shape. */
  waistW?: number;
  /** Half width at the hem. */
  hemW: number;
  /** y of the hem at the sides. */
  length: number;
  /** Extra drop of the hem at the center (a shirt-tail curve). 0 = straight. */
  hemCurve?: number;
  /** Depth of the armhole below the shoulder tip. */
  armhole: number;
  /** Length of the sleeve along its top edge, from the shoulder tip. */
  sleeveLen: number;
  /** Sleeve width at the cuff, measured across the sleeve. */
  cuffW: number;
  /** Angle of the sleeve's top edge in degrees below horizontal (short tee ≈ 28, long ≈ 76). */
  sleeveAngle: number;
  /**
   * Width of the sleeve at the top, across its axis. When wider than the
   * shoulder-to-armpit span at `sleeveAngle`, the sleeve lies over the body's
   * side (a flat lay with the arms down). Default: the sleeve meets the body
   * at the armpit, which is right for short sleeves held out from the body.
   */
  sleeveW?: number;
  /**
   * How far the inner cuff corner hangs out from the body side, in units.
   * When set, `sleeveAngle` is only a starting guess: the sleeve is turned
   * until its cuff rests beside the body, so there is no wedge of background
   * between a long sleeve and the torso.
   */
  hang?: number;
  /**
   * The front neckline: a start point on the center line and the segments
   * from there up to the shoulder-neck point (CX + neckW, neckY). Defaults
   * to a crew neck of depth `neckDepth`.
   */
  neck?: Neckline;
  /** Depth of the default crew neck below the shoulder line. */
  neckDepth?: number;
}

export interface Neckline {
  start: Pt;
  segs: readonly Seg[];
}

export interface Torso {
  /** The spec as drawn (`sleeveAngle` resolved when `hang` is set). */
  spec: TorsoSpec;
  /** Closed silhouette: body and both sleeves (fill and clip). */
  outline: string;
  /**
   * The silhouette's ink: the outline without the parts a sleeve lying over
   * the body hides. Stroke this, not `outline`.
   */
  edges: string;
  /** Markup of the soft shadow the sleeves cast on the body where they lie over it ("" when they do not). */
  sleeveShade: string;
  /** Shoulder tip, right side. */
  shoulder: Pt;
  /** Armpit on the body side, right side. */
  armpit: Pt;
  /** Where the right sleeve's underarm edge starts (the armpit, or a point over the body). */
  underarm: Pt;
  /** Cuff corners of the right sleeve: outer (top edge) and inner (underarm). */
  cuffOuter: Pt;
  cuffInner: Pt;
  /** Unit vector along the sleeve's top edge, shoulder → cuff. */
  sleeveDir: Pt;
  /** The armhole seams of both sleeves. */
  armSeams: string;
  /** A stitch line across each sleeve, `inset` units from the cuff edge. */
  cuffLines(inset: number): string;
  /** Path data of the right sleeve cuff region, `depth` units deep (for rib cuffs). */
  cuffBand(depth: number): string;
  /** Path data of a hem band `depth` units deep (for rib hems). */
  hemBand(depth: number): string;
  /** Path data of the whole right sleeve (shoulder to cuff), for colorblock panels. */
  sleevePanel(): string;
  /** Pattern panels for both sleeves: a field pattern turns to run along each arm. */
  panels: ArtPanel[];
  /** A line parallel to the hem, `inset` units above it, shortened by `margin` at each end. */
  hemLine(inset: number, margin?: number): string;
  /** y of the chest line, `t` of the way from the armpit to the hem. */
  bodyY(t: number): number;
}

export function crewNeck(neckW: number, neckY: number, depth: number): Neckline {
  return {
    start: [CX, neckY + depth],
    segs: [C([CX + neckW * 0.52, neckY + depth], [CX + neckW, neckY + depth * 0.58], [CX + neckW, neckY])],
  };
}

const mirrorPt = ([x, y]: Pt): Pt => [2 * CX - x, y];

const mirrorSeg = (seg: Seg): Seg => {
  switch (seg[0]) {
    case "L":
      return ["L", mirrorPt(seg[1])];
    case "Q":
      return ["Q", mirrorPt(seg[1]), mirrorPt(seg[2])];
    case "C":
      return ["C", mirrorPt(seg[1]), mirrorPt(seg[2]), mirrorPt(seg[3])];
  }
};

/** The same run of segments walked backwards. */
function reversed(start: Pt, segs: readonly Seg[]): { start: Pt; segs: Seg[] } {
  const ends: Pt[] = [start];
  for (const seg of segs) ends.push(seg[seg.length - 1] as Pt);
  const out: Seg[] = [];
  for (let i = segs.length - 1; i >= 0; i--) {
    const seg = segs[i];
    const to = ends[i];
    if (seg[0] === "L") out.push(["L", to]);
    else if (seg[0] === "Q") out.push(["Q", seg[1], to]);
    else out.push(["C", seg[2], seg[1], to]);
  }
  return { start: ends[ends.length - 1], segs: out };
}

/** A point on a cubic. */
function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const a = lerp(lerp(p0, p1, t), lerp(p1, p2, t), t);
  const b = lerp(lerp(p1, p2, t), lerp(p2, p3, t), t);
  return lerp(a, b, t);
}

/** The part of a quadratic from `t` to its end, as its own control points. */
function quadFrom(p0: Pt, p1: Pt, p2: Pt, t: number): [Pt, Pt, Pt] {
  const p01 = lerp(p0, p1, t);
  const p12 = lerp(p1, p2, t);
  return [lerp(p01, p12, t), p12, p2];
}

/** The part of a cubic from `t` to its end, as its own control points. */
function cubicFrom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [Pt, Pt, Pt, Pt] {
  const p01 = lerp(p0, p1, t);
  const p12 = lerp(p1, p2, t);
  const p23 = lerp(p2, p3, t);
  const p012 = lerp(p01, p12, t);
  const p123 = lerp(p12, p23, t);
  return [lerp(p012, p123, t), p123, p23, p3];
}

/** Where the segment a–b crosses c–d, as the parameter along a–b, or undefined. */
function crossing(a: Pt, b: Pt, c: Pt, d: Pt): number | undefined {
  const r: Pt = [b[0] - a[0], b[1] - a[1]];
  const s: Pt = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return undefined;
  const w: Pt = [c[0] - a[0], c[1] - a[1]];
  const t = (w[0] * s[1] - w[1] * s[0]) / den;
  const k = (w[0] * r[1] - w[1] * r[0]) / den;
  return t >= 0 && t <= 1 && k >= 0 && k <= 1 ? t : undefined;
}

export function torso(input: TorsoSpec): Torso {
  const { neckW, neckY, shoulderW, shoulderDrop, chestW, hemW, length, armhole, sleeveLen, cuffW } = input;
  const waistW = input.waistW ?? Math.min(chestW, hemW);
  const hemCurve = input.hemCurve ?? 0;
  const neckDepth = input.neckDepth ?? 16;
  const neck = input.neck ?? crewNeck(neckW, neckY, neckDepth);

  const S: Pt = [CX + shoulderW, neckY + shoulderDrop];
  const A: Pt = [CX + chestW, S[1] + armhole];
  const H: Pt = [CX + hemW, length];
  const hemMid: Pt = [CX, length + hemCurve];

  // The body side, armpit to hem.
  const side1: Pt = [CX + waistW, lerp(A, H, 0.42)[1]];
  const side2: Pt = [CX + hemW - (hemW - waistW) * 0.25, lerp(A, H, 0.8)[1]];
  const bodySide = C(side1, side2, H);
  const sideAt = (t: number) => cubicAt(A, side1, side2, H, t);
  const bodyX = (y: number): number => {
    if (y <= A[1]) return A[0];
    if (y >= length) return H[0];
    let best = A;
    for (let i = 0; i <= 40; i++) {
      const p = sideAt(i / 40);
      if (Math.abs(p[1] - y) < Math.abs(best[1] - y)) best = p;
    }
    return best[0];
  };

  const sleeveAngle =
    input.hang === undefined ? input.sleeveAngle : sleeveHang(S, sleeveLen, cuffW, bodyX, input.hang, input.sleeveAngle);
  const spec: TorsoSpec = { ...input, sleeveAngle };
  const u = dir(sleeveAngle);
  const v = perp(u);
  const Co = add(S, u, sleeveLen);
  const Ci = add(Co, v, cuffW);

  // Where the underarm edge starts: at the armpit, or (for a sleeve wider
  // than the shoulder-to-armpit span) at the same height over the body.
  const spanW = (A[0] - S[0]) * v[0] + (A[1] - S[1]) * v[1];
  const W = Math.max(input.sleeveW ?? 0, spanW);
  const over = W > spanW + 0.01;
  const U: Pt = over ? add(add(S, v, W), u, (armhole - v[1] * W) / u[1]) : A;

  // Over the body the shoulder tip is a soft fold, not a corner: the
  // shoulder slope stops `r` short of the tip and a small arc turns into the
  // sleeve's top edge.
  const shoulderCtrl: Pt = [CX + neckW + (shoulderW - neckW) * 0.55, neckY + shoulderDrop * 0.25];
  const r = over ? 3 : 0;
  const slope = Math.hypot(S[0] - shoulderCtrl[0], S[1] - shoulderCtrl[1]);
  const S0: Pt = over ? [S[0] - ((S[0] - shoulderCtrl[0]) / slope) * r, S[1] - ((S[1] - shoulderCtrl[1]) / slope) * r] : S;
  const S1: Pt = over ? add(S, u, r) : S;
  const shoulder = Q(shoulderCtrl, S0);
  const tip: Seg[] = over ? [Q(S, S1)] : [];
  const sleeveTop = Q(add(lerp(S1, Co, 0.5), v, -1.5), Co);
  const underarm = Q(add(lerp(Ci, U, 0.5), v, 1.5), U);
  const hem = hemCurve ? Q([CX + hemW * 0.5, length + hemCurve], hemMid) : L(hemMid);
  // Armhole seam: leaves the shoulder tip, bows a little into the sleeve,
  // meets the underarm; over the body it hooks in like a J.
  const capSeam = over
    ? C([S[0] - 0.5, S[1] + (U[1] - S[1]) * 0.6], [U[0] + (S[0] - U[0]) * 0.45, U[1] + 0.5], U)
    : C([S[0] - 1, lerp(S, A, 0.4)[1]], [A[0] + 3, A[1] - armhole * 0.22], A);
  const armSeam = path(S0, [capSeam]);
  // The sleeve as a closed panel: around its edges to the underarm, then back
  // up the armhole seam to the shoulder.
  const capBack: Seg = over
    ? C([U[0] + (S[0] - U[0]) * 0.45, U[1] + 0.5], [S[0] - 0.5, S[1] + (U[1] - S[1]) * 0.6], S0)
    : C([A[0] + 3, A[1] - armhole * 0.22], [S[0] - 1, lerp(S, A, 0.4)[1]], S0);
  const sleeveClosed = path(S0, [...tip, sleeveTop, L(Ci), underarm, capBack], true);
  const sleeveOpen = path(S0, [...tip, sleeveTop, L(Ci), underarm]);

  let outline: string;
  let edges: string;
  let sleeveShade = "";
  if (!over) {
    outline = symmetric(neck.start, [...neck.segs, shoulder, sleeveTop, L(Ci), underarm, bodySide, hem]);
    edges = outline;
  } else {
    // Body and sleeves as separate shapes of one winding, so the fill and
    // the clip are their union.
    const body = symmetric(neck.start, [...neck.segs, shoulder, L([S[0], A[1]]), L(A), bodySide, hem]);
    const leftSleeve = (() => {
      const back = reversed(S0, [...tip, sleeveTop, L(Ci), underarm, capSeam]);
      return path(mirrorPt(back.start), back.segs.map(mirrorSeg), true);
    })();
    outline = body + sleeveClosed + leftSleeve;
    // The body side shows from where the sleeve's underarm edge (or its
    // cuff) crosses it down to the hem; a sleeve hanging past the hem hides
    // the side altogether and crosses the hem instead.
    const ctrl = add(lerp(Ci, U, 0.5), v, 1.5);
    const chain: Pt[] = [Co];
    for (let i = 0; i <= 24; i++) chain.push(lerp(lerp(Ci, ctrl, i / 24), lerp(ctrl, U, i / 24), i / 24));
    const hemCtrl: Pt = [CX + hemW * 0.5, length + hemCurve];
    const hemAt = (t: number) => (hemCurve ? lerp(lerp(H, hemCtrl, t), lerp(hemCtrl, hemMid, t), t) : lerp(H, hemMid, t));
    const N = 96;
    const firstCrossing = (at: (t: number) => Pt): number | undefined => {
      for (let i = 0; i < N; i++) {
        const a = at(i / N);
        const b = at((i + 1) / N);
        for (let j = 0; j < chain.length - 1; j++) {
          const t = crossing(a, b, chain[j], chain[j + 1]);
          if (t !== undefined) return (i + t) / N;
        }
      }
      return undefined;
    };
    const tJ = firstCrossing(sideAt);
    let lowerRight: Seg[];
    let J: Pt;
    if (tJ !== undefined) {
      J = sideAt(tJ);
      const [, q1, q2] = cubicFrom(A, side1, side2, H, tJ);
      lowerRight = [C(q1, q2, H), hem];
    } else {
      const tX = firstCrossing(hemAt) ?? 0;
      J = hemAt(tX);
      if (hemCurve) {
        const [, c1] = quadFrom(H, hemCtrl, hemMid, tX);
        lowerRight = [Q(c1, hemMid)];
      } else lowerRight = [L(hemMid)];
    }
    const lowerLeft = reversed(J, lowerRight);
    const lower = path(J, [...lowerRight, ...lowerLeft.segs.map(mirrorSeg)]);
    const upperRight: Seg[] = [...neck.segs, shoulder];
    const upperLeft = reversed(neck.start, upperRight);
    const upper = path(mirrorPt(upperLeft.start), [...upperLeft.segs.map(mirrorSeg), ...upperRight]);
    edges = upper + lower + sleeveOpen + mirrored(sleeveOpen);
    // The sleeve's shadow on the body: a sliver along its underarm edge,
    // from the underarm to where the edge leaves the body.
    const end = tJ !== undefined ? J : Ci;
    const shadow = path(U, [L(end), L(add(end, v, 0.8)), L(add(U, v, 3.2))], true);
    sleeveShade = shade(shadow, 0.12) + shade(mirrored(shadow), 0.12);
  }

  const cuffStitch = (inset: number) => polyline(add(Co, u, -inset), add(Ci, u, -inset));
  const hemLine = (inset: number, margin = 2) => {
    const l: Pt = [CX - hemW + margin, length - inset];
    const r: Pt = [CX + hemW - margin, length - inset];
    if (!hemCurve) return polyline(l, r);
    return path(l, [Q([CX, length + hemCurve - inset], r)]);
  };
  const bothSides = (d: string) => seam(d) + seam(mirrored(d));

  const cuffBand = (depth: number) =>
    path(add(Co, u, -depth), [L(Co), L(Ci), L(add(Ci, u, -depth))], true);
  const hemBand = (depth: number) =>
    symmetric([CX, length - depth + hemCurve], [
      hemCurve ? Q([CX + hemW * 0.5, length - depth + hemCurve], [CX + hemW, length - depth]) : L([CX + hemW, length - depth]),
      L(H),
      hemCurve ? Q([CX + hemW * 0.5, length + hemCurve], hemMid) : L(hemMid),
    ]);

  return {
    spec,
    outline,
    edges,
    sleeveShade,
    shoulder: S,
    armpit: A,
    underarm: U,
    cuffOuter: Co,
    cuffInner: Ci,
    sleeveDir: u,
    armSeams: bothSides(armSeam),
    cuffLines: (inset) => bothSides(cuffStitch(inset)),
    cuffBand,
    hemBand,
    sleevePanel: () => sleeveClosed,
    panels: sleevePanelsOf(sleeveClosed, sleeveAngle),
    hemLine,
    bodyY: (t) => A[1] + (length - A[1]) * t,
  };
}
