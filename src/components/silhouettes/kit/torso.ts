/**
 * The shared body for every top: a torso with two sleeves as one closed
 * silhouette, plus the seams that go with it. Garment modules describe a fit
 * as numbers (`TorsoSpec`), get the geometry back (`Torso`) and add their own
 * neckline, trims and details on top.
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
  symmetric,
  type Pt,
  type Seg,
} from "./draw";

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
  spec: TorsoSpec;
  /** Closed silhouette: body and both sleeves. */
  outline: string;
  /** Shoulder tip, right side. */
  shoulder: Pt;
  /** Armpit, right side. */
  armpit: Pt;
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

export function torso(spec: TorsoSpec): Torso {
  const {
    neckW,
    neckY,
    shoulderW,
    shoulderDrop,
    chestW,
    hemW,
    length,
    armhole,
    sleeveLen,
    cuffW,
    sleeveAngle,
  } = spec;
  const waistW = spec.waistW ?? Math.min(chestW, hemW);
  const hemCurve = spec.hemCurve ?? 0;
  const neckDepth = spec.neckDepth ?? 16;
  const neck = spec.neck ?? crewNeck(neckW, neckY, neckDepth);

  const S: Pt = [CX + shoulderW, neckY + shoulderDrop];
  const u = dir(sleeveAngle);
  const v = perp(u);
  const Co = add(S, u, sleeveLen);
  const Ci = add(Co, v, cuffW);
  const A: Pt = [CX + chestW, S[1] + armhole];
  const H: Pt = [CX + hemW, length];
  const hemMid: Pt = [CX, length + hemCurve];

  const start = neck.start;
  const bodySide = C([CX + waistW, lerp(A, H, 0.42)[1]], [CX + hemW - (hemW - waistW) * 0.25, lerp(A, H, 0.8)[1]], H);
  const hem = hemCurve ? Q([CX + hemW * 0.5, length + hemCurve], hemMid) : L(hemMid);
  const segs: Seg[] = [
    ...neck.segs,
    // shoulder: a gentle convex slope to the tip
    Q([CX + neckW + (shoulderW - neckW) * 0.55, neckY + shoulderDrop * 0.25], S),
    // sleeve top edge, slightly bowed outwards
    Q(add(lerp(S, Co, 0.5), v, -1.5), Co),
    L(Ci),
    // underarm back to the armpit
    Q(add(lerp(Ci, A, 0.5), v, 1.5), A),
    bodySide,
    hem,
  ];
  const outline = symmetric(start, segs);

  // Armhole seam: leaves the shoulder tip, bows a little into the sleeve,
  // meets the armpit.
  const armSeam = path(S, [C([S[0] - 1, lerp(S, A, 0.4)[1]], [A[0] + 3, A[1] - armhole * 0.22], A)]);
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
  const sleevePanel = () =>
    path(S, [Q(add(lerp(S, Co, 0.5), v, -1.5), Co), L(Ci), Q(add(lerp(Ci, A, 0.5), v, 1.5), A), C([A[0] + 3, A[1] - armhole * 0.22], [S[0] - 1, lerp(S, A, 0.4)[1]], S)], true);

  return {
    spec,
    outline,
    shoulder: S,
    armpit: A,
    cuffOuter: Co,
    cuffInner: Ci,
    sleeveDir: u,
    armSeams: bothSides(armSeam),
    cuffLines: (inset) => bothSides(cuffStitch(inset)),
    cuffBand,
    hemBand,
    sleevePanel,
    hemLine,
    bodyY: (t) => A[1] + (length - A[1]) * t,
  };
}

