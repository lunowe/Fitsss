/**
 * The shared body for trousers and shorts: a waistband and two legs as one
 * closed silhouette, plus hem lines. Fits are leg widths at the hip, knee and
 * hem. Half widths from the center line x = 100; y grows downwards.
 */
import { C, CX, L, mirrored, path, polyline, Q, seam, symmetric, type Pt } from "./draw";

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
   */
  pool?: number;
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
  /** Outer x of the right leg at a given y (linear between hip, knee and hem). */
  outerX(y: number): number;
}

export function legs(spec: LegsSpec): Legs {
  const { waistY, waistW, hipW, kneeW, hemW, rise, length } = spec;
  const gap = spec.gap ?? 6;
  const band = spec.band ?? 9;
  const pool = spec.pool ?? 0;
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
  const segs = [
    L([CX + waistW, waistY]),
    // Hip: the seat curves out from the waist.
    C([CX + waistW, waistY + rise * 0.3], [CX + hipW, hipY - rise * 0.15], [CX + hipW, hipY]),
    // Outseam: hip → knee → hem.
    C([CX + hipW, hipY + (kneeY - hipY) * 0.5], [kneeOuter - lean * (kneeY - hipY) * 0.35, kneeY - (kneeY - hipY) * 0.35], [kneeOuter, kneeY]),
    C([kneeOuter + lean * shin * 0.35, kneeY + shin * 0.35], [hemOuter[0] - lean * shin * 0.3 + pool * 0.6, length - shin * 0.3], hemOuter),
    // Hem: straight, or rippling when the leg pools.
    pool ? C([hemOuter[0] - hemW * 0.2, length + pool], [hemInner[0] + hemW * 0.35, length + pool * 0.1], hemInner) : L(hemInner),
    // Inseam: hem → knee → crotch.
    C([hemInner[0], length - (length - kneeY) * 0.45], [kneeInner, kneeY + (length - kneeY) * 0.35], [kneeInner, kneeY]),
    C([kneeInner, kneeY - (kneeY - crotchY) * 0.4], [CX + 2, crotchY + 6], [CX, crotchY]),
  ];
  const outline = symmetric([CX, waistY], segs);
  const bandPath = symmetric([CX, waistY], [L([CX + waistW, waistY]), Q([CX + waistW + 0.5, waistY + band * 0.6], [CX + waistW + 1, waistY + band]), L([CX, waistY + band])]);
  const bandLine = polyline([CX - waistW - 1, waistY + band], [CX + waistW + 1, waistY + band]);
  const hemLine = (inset: number) =>
    pool
      ? path([hemInner[0] + 1.5, length - inset], [C([hemInner[0] + hemW * 0.35, length - inset + pool * 0.1], [hemOuter[0] - hemW * 0.2, length - inset + pool], [hemOuter[0] - 1.5, length - inset])])
      : polyline([hemInner[0] + 1.5, length - inset], [hemOuter[0] - 1.5, length - inset]);
  // A pooling leg breaks on the shoe: a soft fold across the leg above the hem.
  const breakY = length - 11 - pool;
  const breakLine = path([hemInner[0] + 4, breakY - 1.5], [C([hemInner[0] + hemW * 0.3, breakY + pool * 0.9], [hemOuter[0] - hemW * 0.35, breakY + pool * 0.5], [hemOuter[0] - 4, breakY - 1])]);
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
    hemLines: (inset) => seam(hemLine(inset)) + seam(mirrored(hemLine(inset))) + (pool ? seam(breakLine) + seam(mirrored(breakLine)) : ""),
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
