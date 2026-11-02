/**
 * The shared body for trousers and shorts: a waistband and two legs as one
 * closed silhouette, plus hem lines. Fits are leg widths at the hip, knee and
 * hem. Half widths from the center line x = 100; y grows downwards.
 */
import { add, C, CX, INK, L, lerp, mirrored, path, polyline, Q, seam, symmetric, type Pt, type Seg } from "./draw";

export interface LegsSpec {
  /** y of the top of the waistband. */
  waistY: number;
  /** Half width of the waist. */
  waistW: number;
  /** Half width at the hip (the widest point of the seat). */
  hipW: number;
  /** Width of one leg at the knee. */
  kneeW: number;
  /** Width of one leg at the hem. */
  hemW: number;
  /** Depth of the crotch below the waist. */
  rise: number;
  /** y of the hem. */
  length: number;
  /** Gap between the two legs at the hem. */
  gap?: number;
  /** Depth of the waistband. */
  band?: number;
  /**
   * Fabric pooling at the hem (a baggy leg breaking on the shoe): the hem
   * edge ripples by this much and the leg bows out just above it. 0 = clean.
   * From 6 up the leg stacks: a second fold above the first.
   */
  pool?: number;
  /**
   * Thigh volume: how far the outseam bellies out between the hip and the
   * knee, beyond the straight fall of the leg (a baggy leg's balloon). 0 = the
   * leg falls from the hip.
   */
  thigh?: number;
  /**
   * How much the outseam from the hip to the knee straightens onto its chord
   * (0: the seat rounds into the leg and the leg bends in at mid thigh; 1: one
   * straight taper from the hip to the knee, a drainpipe). A leg much narrower
   * at the knee than the hip needs this, or the thigh reads as a jodhpur.
   */
  taper?: number;
}

export interface Legs {
  spec: LegsSpec;
  /** Closed silhouette: waistband and both legs. */
  outline: string;
  /** y of the crotch. */
  crotchY: number;
  /** y of the knee. */
  kneeY: number;
  /** Path data of the waistband (for a contrasting band). */
  bandPath: string;
  /** The waistband seam line. */
  bandLine: string;
  /** Stitch lines across both hems, `inset` above the hem (and the break fold of a pooling leg). */
  hemLines(inset: number): string;
  /** The break fold across each leg above the hem, when the leg pools (nothing otherwise). */
  breakLines(): string;
  /** A topstitch line along each inseam, `inset` units inside the leg's inner edge (denim's felled seam). */
  inseamLines(inset: number): string;
  /** Outer x of the right leg at a given y (linear between hip, knee and hem). */
  outerX(y: number): number;
}

export function legs(spec: LegsSpec): Legs {
  const { waistY, waistW, hipW, kneeW, hemW, rise, length } = spec;
  const gap = spec.gap ?? 6;
  const band = spec.band ?? 9;
  const pool = spec.pool ?? 0;
  const thigh = spec.thigh ?? 0;
  const taper = spec.taper ?? 0;
  const crotchY = waistY + rise;
  const hipY = waistY + rise * 0.55;
  const kneeY = crotchY + (length - crotchY) * 0.47;
  const kneeGap = Math.min(gap, 6);
  const kneeOuter = CX + kneeGap / 2 + kneeW;
  const kneeInner = CX + kneeGap / 2;
  const hemOuter: Pt = [CX + gap / 2 + hemW, length];
  const hemInner: Pt = [CX + gap / 2, length];
  // Below the knee the leg falls straight to the hem (a taper, a plumb line
  // or an A), and the thigh curve arrives at the knee already on that line,
  // so a wide leg is a straight column and never bells out.
  const shin = length - kneeY;
  const lean = (hemOuter[0] - kneeOuter) / shin;
  // Outseam controls from the hip to the knee: an S (the seat rounds into
  // the leg, the leg bends in above the knee) straightened `taper` of the way
  // onto the chord, then bellied out by `thigh`.
  const hip: Pt = [CX + hipW, hipY];
  const knee: Pt = [kneeOuter, kneeY];
  const s1: Pt = [CX + hipW, hipY + (kneeY - hipY) * 0.5];
  const s2: Pt = [kneeOuter - lean * (kneeY - hipY) * 0.35, kneeY - (kneeY - hipY) * 0.35];
  const c1 = add(lerp(s1, lerp(hip, knee, 0.4), taper), [thigh * 1.6, 0]);
  const c2 = add(lerp(s2, lerp(hip, knee, 0.7), taper), [thigh * 0.5, 0]);
  const segs = [
    L([CX + waistW, waistY]),
    // Hip: the seat curves out from the waist.
    C([CX + waistW, waistY + rise * 0.3], [CX + hipW, hipY - rise * 0.15], hip),
    // Outseam: hip → knee → hem.
    C(c1, c2, knee),
    C([kneeOuter + lean * shin * 0.35, kneeY + shin * 0.35], [hemOuter[0] - lean * shin * 0.3 + pool * 0.6, length - shin * 0.3], hemOuter),
    // Hem: straight, or rippling when the leg pools: the edge dips under the
    // outer half of the leg and lifts under the inner, a bunched hem.
    pool ? C([hemOuter[0] - hemW * 0.3, length + pool], [hemInner[0] + hemW * 0.3, length - pool * 0.15], hemInner) : L(hemInner),
    // Inseam: hem → knee → crotch.
    C([hemInner[0], length - (length - kneeY) * 0.45], [kneeInner, kneeY + (length - kneeY) * 0.35], [kneeInner, kneeY]),
    C([kneeInner, kneeY - (kneeY - crotchY) * 0.4], [CX + 2, crotchY + 6], [CX, crotchY]),
  ];
  const outline = symmetric([CX, waistY], segs);
  const bandPath = symmetric([CX, waistY], [L([CX + waistW, waistY]), Q([CX + waistW + 0.5, waistY + band * 0.6], [CX + waistW + 1, waistY + band]), L([CX, waistY + band])]);
  const bandLine = polyline([CX - waistW - 1, waistY + band], [CX + waistW + 1, waistY + band]);
  const hemLine = (inset: number) =>
    pool
      ? path([hemInner[0] + 1.5, length - inset], [C([hemInner[0] + hemW * 0.3, length - inset - pool * 0.15], [hemOuter[0] - hemW * 0.3, length - inset + pool], [hemOuter[0] - 1.5, length - inset])])
      : polyline([hemInner[0] + 1.5, length - inset], [hemOuter[0] - 1.5, length - inset]);
  // A pooling leg breaks on the shoe. A slight break (a tailored leg) is a
  // short soft fold in the middle of the leg, so it does not read as a
  // turn-up. A pooled leg stacks: two folds that start from alternate seams
  // and die out part way across, each a crease with a tonal shadow under
  // it, so the stack reads as cloth bunching over the shoe rather than as
  // lines ruled across the leg.
  const breakIn = hemW * 0.24;
  const tailored = path([hemInner[0] + breakIn, length - 11 - pool - 1.5], [C([hemInner[0] + hemW * 0.3, length - 11 - pool * 0.1], [hemOuter[0] - hemW * 0.35, length - 11 - pool * 0.5], [hemOuter[0] - breakIn, length - 11 - pool - 1])]);
  /** A fold from the seam at x = `from` running `reach` of the leg across towards `to`, at `y`. */
  const fold = (from: number, to: number, y: number, reach: number, sag: number) => {
    const at = (t: number) => from + (to - from) * t;
    // The crease leaves the seam, swings down through the leg and lifts
    // again as it dies out; its shadow is a crescent hanging under it.
    const start: Pt = [at(0), y - sag * 0.5];
    const end: Pt = [at(reach), y + sag * 0.15];
    const crease: Seg[] = [C([at(reach * 0.3), y + sag * 1.05], [at(reach * 0.72), y + sag * 1.1], end)];
    const shadow = path(start, [...crease, C([at(reach * 0.7), y + sag * 2.3], [at(reach * 0.28), y + sag * 2.4], [at(0), y + sag * 1.2])], true);
    return {
      line: path(start, crease),
      shadow: `<path d="${shadow}" fill="${INK}" fill-opacity="0.14" stroke="none"/>`,
    };
  };
  const folds = pool >= 3
    ? [fold(hemOuter[0] - 0.4, hemInner[0], length - 13 - pool * 0.6, 0.64, 4.2), fold(hemInner[0] + 0.4, hemOuter[0], length - 27 - pool * 1.1, 0.52, 3.6)]
    : [];
  const breakMarks = pool >= 3 ? folds.map((f) => f.shadow + seam(f.line)).join("") : seam(tailored);
  const breakLine = pool ? breakMarks + breakMarks.replace(/d="([^"]+)"/g, (_, d: string) => `d="${mirrored(d)}"`) : "";
  // The inseam topstitch follows the inner leg edge from the crotch to the hem.
  const inseam = (inset: number) =>
    path([CX + inset + 1, crotchY + 4], [
      C([kneeInner + inset, crotchY + 8], [kneeInner + inset, kneeY - (kneeY - crotchY) * 0.4], [kneeInner + inset, kneeY]),
      C([kneeInner + inset, kneeY + (length - kneeY) * 0.35], [hemInner[0] + inset, length - (length - kneeY) * 0.45], [hemInner[0] + inset, length - 1]),
    ]);
  const outerX = (y: number) => {
    if (y <= hipY) return CX + waistW + (hipW - waistW) * ((y - waistY) / (hipY - waistY));
    if (y <= kneeY) return CX + hipW + (kneeOuter - CX - hipW) * ((y - hipY) / (kneeY - hipY));
    return kneeOuter + (hemOuter[0] - kneeOuter) * ((y - kneeY) / (length - kneeY));
  };
  return {
    spec,
    outline,
    crotchY,
    kneeY,
    bandPath,
    bandLine,
    hemLines: (inset) => seam(hemLine(inset)) + seam(mirrored(hemLine(inset))) + breakLine,
    breakLines: () => breakLine,
    inseamLines: (inset) => seam(inseam(inset)) + seam(mirrored(inseam(inset))),
    outerX,
  };
}

/** The right-side slanted or curved front pocket opening, from the waistband to the outseam. */
export function frontPocket(l: Legs, inset: number, drop: number): string {
  const { waistY, waistW } = l.spec;
  const band = l.spec.band ?? 9;
  const top: Pt = [CX + waistW - inset, waistY + band];
  const side: Pt = [l.outerX(waistY + band + drop) - 0.5, waistY + band + drop];
  return path(top, [Q([top[0] + (side[0] - top[0]) * 0.35, side[1] - drop * 0.1], side)]);
}
