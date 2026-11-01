/**
 * Tank top: sleeveless, with a scooped ribbed neck, narrow straps, deep bound
 * armholes and a stitched hem.
 */
import { C, CX, fill, ink, L, mirrored, path, piece, Q, seam, stroke, symmetric, type Pt } from "../draw";
import { frame } from "../parts-tops";
import type { KitPiece } from "../types";
import { crewNeck } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;
const NECK_D = 24;

interface TankSpec {
  /** Half width of the neck opening at the shoulder line. */
  neckW: number;
  /** Width of a strap. */
  strap: number;
  chestW: number;
  waistW?: number;
  hemW: number;
  /** Depth of the armpit below the shoulder line. */
  armhole: number;
  length: number;
}

const BASE: TankSpec = { neckW: 18, strap: 10, chestW: 52, hemW: 51, armhole: 52, length: 142 };

const FITS: Record<string, Partial<TankSpec>> = {
  fitted: { neckW: 17, strap: 8, chestW: 45, waistW: 39, hemW: 43, armhole: 48, length: 138 },
  regular: {},
  relaxed: { neckW: 19, strap: 11, chestW: 59, hemW: 58, armhole: 56, length: 150 },
  oversized: { neckW: 22, strap: 13, chestW: 72, hemW: 71, armhole: 66, length: 164 },
  boxy: { neckW: 22, strap: 13, chestW: 70, hemW: 70, armhole: 60, length: 128 },
};

function tank(fit: string): KitPiece {
  const s = { ...BASE, ...FITS[fit] };
  const waistW = s.waistW ?? Math.min(s.chestW, s.hemW);
  const neck = crewNeck(s.neckW, NECK_Y, NECK_D);
  const S: Pt = [CX + s.neckW + s.strap, NECK_Y + 2.5];
  const A: Pt = [CX + s.chestW, NECK_Y + s.armhole];
  const H: Pt = [CX + s.hemW, s.length];
  const outline = symmetric(neck.start, [
    ...neck.segs,
    // strap: a gentle arch over the shoulder
    Q([CX + s.neckW + s.strap * 0.5, NECK_Y - 0.6], S),
    // armhole: falls almost straight, then scoops in to the armpit
    C([S[0] - 1, NECK_Y + s.armhole * 0.55], [CX + s.chestW - 8, A[1] - 1], A),
    C([CX + waistW, A[1] + (s.length - A[1]) * 0.42], [CX + s.hemW - (s.hemW - waistW) * 0.25, A[1] + (s.length - A[1]) * 0.8], H),
    L([CX, s.length]),
  ]);
  const rib = crewRib(s.neckW, NECK_Y, NECK_D, 3);
  // Armhole binding, a seam inside the curve.
  const binding = path([S[0] - 3, S[1] + 1.5], [C([S[0] - 4, NECK_Y + s.armhole * 0.55], [CX + s.chestW - 9, A[1] - 4], [A[0] - 1, A[1] - 3.5])]);
  const hemLine = path([CX - s.hemW + 2, s.length - 4], [L([CX + s.hemW - 2, s.length - 4])]);
  const graphicSize = Math.min(Math.round(s.chestW * 2 * 0.48), Math.round((s.length - 10 - A[1]) * 0.72));
  return piece({
    base: [fill(outline)],
    lines: [rib.fills, ink(stroke(outline), seam(binding), seam(mirrored(binding)), seam(hemLine)), rib.lines],
    clip: outline,
    extent: [outline, frame(150, 100)],
    stripe: "h",
    graphic: [CX, Math.round((A[1] + 2 + graphicSize / 2) * 10) / 10, graphicSize],
  });
}

export const TANK_TOP: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`tank-top@${fit}`, tank(fit)]),
);
TANK_TOP["tank-top"] = TANK_TOP["tank-top@regular"];

