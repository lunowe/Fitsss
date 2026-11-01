/**
 * T-shirt: short sleeves, ribbed crew neck. Fits change the shoulders, body
 * width, length and sleeve; the neck rib stays the same so the family reads.
 */
import { C, CX, FILL2, fill, ink, L, mirrored, path, piece, Q, seam, shade, stroke, symmetric, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";

const NECK_Y = 20;

const BASE: Omit<TorsoSpec, "neckW" | "neckY"> = {
  shoulderW: 58,
  shoulderDrop: 9,
  chestW: 55,
  hemW: 54,
  length: 140,
  armhole: 30,
  sleeveLen: 36,
  cuffW: 27,
  sleeveAngle: 28,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 54, chestW: 50, waistW: 45, hemW: 47, length: 136, armhole: 27, sleeveLen: 32, cuffW: 23, sleeveAngle: 30 },
  regular: {},
  relaxed: { shoulderW: 62, chestW: 60, hemW: 59, length: 144, armhole: 33, sleeveLen: 39, cuffW: 30 },
  oversized: { shoulderW: 72, shoulderDrop: 13, chestW: 71, hemW: 70, length: 158, armhole: 40, sleeveLen: 42, cuffW: 36, sleeveAngle: 34 },
  boxy: { shoulderW: 70, shoulderDrop: 11, chestW: 69, hemW: 69, length: 126, armhole: 38, sleeveLen: 36, cuffW: 34, sleeveAngle: 30 },
};

/**
 * A ribbed crew neck: the back rib peeking over the shoulder line, the inside
 * of the back panel, and the front rib band. `w` is the half width of the
 * opening, `d` the front depth, `r` the rib width.
 */
export function crewRib(w: number, y: number, d: number, r: number): { fills: string; lines: string } {
  const up = (hw: number, depth: number): [Pt, Pt, Pt] => [[CX + hw * 0.52, y + depth], [CX + hw, y + depth * 0.58], [CX + hw, y]];
  const down = (hw: number, depth: number): [Pt, Pt, Pt] => [[CX + hw, y + depth * 0.58], [CX + hw * 0.52, y + depth], [CX, y + depth]];
  const backDip = 3;
  // Back rib: between the back neckline and a curve `r` lower.
  const backRib = symmetric([CX, y + backDip], [Q([CX + w * 0.55, y + backDip], [CX + w, y]), L([CX + w - r, y]), Q([CX + (w - r) * 0.55, y + backDip + r], [CX, y + backDip + r])]);
  // Inside of the back panel, seen through the front opening.
  const inside = symmetric([CX, y + backDip + r], [Q([CX + (w - r) * 0.55, y + backDip + r], [CX + w - r, y]), C(...down(w - r, d - r))]);
  // Front rib: between the neckline seam and the opening edge.
  const frontRib = symmetric([CX, y + d], [C(...up(w, d)), L([CX + w - r, y]), C(...down(w - r, d - r))]);
  const insideEdge = path([CX - (w - r), y], [C([CX - (w - r), y + (d - r) * 0.58], [CX - (w - r) * 0.52, y + d - r], [CX, y + d - r]), C(...up(w - r, d - r))]);
  const backTop = path([CX - w, y], [Q([CX - w * 0.55, y + backDip], [CX, y + backDip]), Q([CX + w * 0.55, y + backDip], [CX + w, y])]);
  const backInner = path([CX - (w - r), y], [Q([CX - (w - r) * 0.55, y + backDip + r], [CX, y + backDip + r]), Q([CX + (w - r) * 0.55, y + backDip + r], [CX + w - r, y])]);
  return {
    fills: fill(inside) + shade(inside, 0.22) + fill(backRib, FILL2) + fill(frontRib, FILL2),
    lines: ink(stroke(backTop), seam(backInner), stroke(insideEdge)),
  };
}

function tee(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit], neckW: 15, neckY: NECK_Y };
  const t = torso(spec);
  const rib = crewRib(spec.neckW, NECK_Y, 15, 3.5);
  const chestY = t.bodyY(0.26);
  return piece({
    base: [fill(t.outline)],
    lines: [rib.fills, ink(stroke(t.outline), t.armSeams, t.cuffLines(4), seam(t.hemLine(4))), rib.lines],
    clip: t.outline,
    stripe: "h",
    graphic: [CX, chestY + 10, Math.round(spec.chestW * 0.78)],
    logo: [CX + spec.chestW * 0.42, t.bodyY(0.12), 13],
    block: t.sleevePanel() + mirrored(t.sleevePanel()),
  });
}

export const TEE: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`t-shirt@${fit}`, tee(fit)]),
);
TEE["t-shirt"] = TEE["t-shirt@regular"];
