/**
 * Shared parts for trousers and shorts, on top of `legs.ts`: the fit tables
 * the whole group uses, belt loops, flies, slant pockets, elastic bands and
 * rib cuffs.
 */
import { C, CX, FILL2, fill, ink, L, mirrored, path, polyline, Q, seam, shade, stroke, symmetric, type Pt } from "./draw";
import type { Legs, LegsSpec } from "./legs";

/** The reference trouser block (as `jeans`): regular rise, straight leg. */
export const PANT_BASE: LegsSpec = {
  waistY: 12,
  waistW: 35,
  hipW: 42,
  kneeW: 33,
  hemW: 31,
  rise: 62,
  length: 236,
  gap: 7,
  band: 9,
};

/**
 * Leg widths per fit, shared by every trouser (`jeans` included) so fits
 * match across bottoms. Fits share one frame, so each step is a change the
 * eye can count at 92 px (about six units at the knee): skinny hugs the leg
 * to a narrow ankle; slim tapers; straight falls plumb from the knee;
 * relaxed is fuller; baggy is wide through the thigh and hem and pools on
 * the shoe; wide is a straight column from the hip, a touch wider at the
 * hem (never a flare).
 */
export const PANT_FITS: Record<string, Partial<LegsSpec>> = {
  skinny: { hipW: 39, kneeW: 19, hemW: 13, gap: 7 },
  slim: { hipW: 41, kneeW: 27, hemW: 22, gap: 6 },
  straight: { kneeW: 33, hemW: 32 },
  relaxed: { hipW: 46, kneeW: 41, hemW: 39 },
  baggy: { hipW: 51, kneeW: 52, hemW: 49, length: 240, gap: 8, pool: 5 },
  wide: { hipW: 45, kneeW: 51, hemW: 59, gap: 8 },
};

/**
 * Shorts: the same block cut above the knee; widths and length per fit. The
 * leg stays close to the hip width so the seat does not balloon over a
 * narrower thigh; fits grow in width and in length together, baggy with
 * real volume through the thigh.
 */
export const SHORT_BASE: LegsSpec = { ...PANT_BASE, length: 122, gap: 6 };
export const SHORT_FITS: Record<string, Partial<LegsSpec>> = {
  slim: { hipW: 38, kneeW: 31, hemW: 29, length: 112 },
  regular: { hipW: 42, kneeW: 38, hemW: 37 },
  relaxed: { hipW: 46, kneeW: 45, hemW: 45, length: 130 },
  baggy: { hipW: 52, kneeW: 55, hemW: 55, length: 140, gap: 8 },
};

/** Belt loops across the waistband: fabric tabs with a stitch outline. */
export function beltLoops(l: Legs, xs: number[]): string {
  const { waistY } = l.spec;
  const band = l.spec.band ?? 9;
  const loop = (x: number) => path([x - 1.8, waistY + 1], [L([x - 1.8, waistY + band - 1]), L([x + 1.8, waistY + band - 1]), L([x + 1.8, waistY + 1])], true);
  return xs.map((x) => fill(loop(x))).join("") + ink(...xs.map((x) => seam(loop(x))));
}

/** The usual four loops: two near the sides, two near the center. */
export function loopXs(l: Legs): number[] {
  const { waistW } = l.spec;
  return [CX - waistW + 7, CX - 13, CX + 13, CX + waistW - 7];
}

/** A plain fly: the center seam and a straight topstitch, right of center. */
export function fly(l: Legs, curved = false): string {
  const { waistY } = l.spec;
  const band = l.spec.band ?? 9;
  const bandBottom = waistY + band;
  const center = polyline([CX, bandBottom], [CX, l.crotchY]);
  const stitch = curved
    ? path([CX + 6, bandBottom + 0.5], [C([CX + 6, l.crotchY - 20], [CX + 5, l.crotchY - 10], [CX + 0.5, l.crotchY - 3])])
    : path([CX + 5.5, bandBottom + 0.5], [L([CX + 5.5, l.crotchY - 12]), Q([CX + 5.5, l.crotchY - 6], [CX + 0.5, l.crotchY - 3])]);
  return seam(center) + seam(stitch);
}

/** A straight slant pocket from the waistband to the outseam, both sides. */
export function slantPockets(l: Legs, inset: number, drop: number): string {
  const { waistY, waistW } = l.spec;
  const band = l.spec.band ?? 9;
  const top: Pt = [CX + waistW - inset, waistY + band];
  const side: Pt = [l.outerX(waistY + band + drop) - 0.5, waistY + band + drop];
  const d = path(top, [Q([top[0] + (side[0] - top[0]) * 0.3, top[1] + (side[1] - top[1]) * 0.45], side)]);
  return seam(d) + seam(mirrored(d));
}

/** An elastic waistband in the second color, with its gathering stitch. */
export function elasticBand(l: Legs, depth: number): { fills: string; lines: string } {
  const { waistY, waistW } = l.spec;
  const band = symmetric([CX, waistY], [L([CX + waistW, waistY]), Q([CX + waistW + 0.5, waistY + depth * 0.6], [CX + waistW + 1, waistY + depth]), L([CX, waistY + depth])]);
  const mid = polyline([CX - waistW + 1, waistY + depth * 0.5], [CX + waistW - 1, waistY + depth * 0.5]);
  return { fills: fill(band, FILL2), lines: seam(polyline([CX - waistW - 1, waistY + depth], [CX + waistW + 1, waistY + depth])) + seam(mid) };
}

/** Rib cuffs at the hems in the second color, `depth` deep, both legs. */
export function ribCuffs(l: Legs, depth: number): { fills: string; lines: string } {
  const { length } = l.spec;
  const gap = l.spec.gap ?? 6;
  const hemW = l.spec.hemW;
  const inner = CX + gap / 2;
  const outer = CX + gap / 2 + hemW;
  const xo = l.outerX(length - depth);
  const cuff = path([inner, length - depth], [L([xo, length - depth]), L([outer, length]), L([inner, length])], true);
  return {
    fills: fill(cuff, FILL2) + fill(mirrored(cuff), FILL2),
    lines: seam(polyline([inner + 0.5, length - depth], [xo - 0.5, length - depth])) + seam(polyline([2 * CX - inner - 0.5, length - depth], [2 * CX - xo + 0.5, length - depth])),
  };
}

/** Turned-up cuffs at the hems: a shaded band with a fold edge, both legs. */
export function turnUps(l: Legs, depth: number): { fills: string; lines: string } {
  const { length } = l.spec;
  const gap = l.spec.gap ?? 6;
  const hemW = l.spec.hemW;
  const inner = CX + gap / 2;
  const outer = CX + gap / 2 + hemW;
  const xo = l.outerX(length - depth);
  const band = path([inner, length - depth], [L([xo, length - depth]), L([outer, length]), L([inner, length])], true);
  const edge = polyline([inner + 0.3, length - depth], [xo - 0.3, length - depth]);
  return {
    fills: shade(band, 0.12) + shade(mirrored(band), 0.12),
    lines: stroke(edge) + stroke(mirrored(edge)),
  };
}

/** The drawstring of an elastic waistband: two cord ends hanging from the center. */
export function drawstring(l: Legs, depth: number, hang = 14): string {
  const { waistY } = l.spec;
  const y = waistY + depth * 0.5;
  const cord = (k: number) => stroke(path([CX + 3.5 * k, y + 1], [C([CX + 4 * k, y + hang * 0.5], [CX + 5.5 * k, y + hang * 0.7], [CX + 7 * k, y + hang])]));
  return cord(1) + cord(-1);
}
