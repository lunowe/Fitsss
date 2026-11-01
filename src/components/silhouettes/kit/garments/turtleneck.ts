/**
 * Turtleneck: a close knit with a tall ribbed roll neck folded over on itself,
 * long sleeves and narrow rib cuffs and hem.
 */
import { CX, FILL2, fill, ink, L, piece, polyline, Q, seam, shade, stroke, symmetric } from "../draw";
import { ribTrims } from "../parts-tops";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";

const NECK_Y = 42;
const NECK_W = 14;
const COLLAR_H = 24;
const RIB = 6;

const BASE: TorsoSpec = {
  neckW: NECK_W,
  neckY: NECK_Y,
  neckDepth: 8,
  shoulderW: 56,
  shoulderDrop: 9,
  chestW: 52,
  waistW: 48,
  hemW: 49,
  length: NECK_Y + 130,
  armhole: 30,
  sleeveLen: 110,
  cuffW: 20,
  sleeveAngle: 76,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 52, chestW: 48, waistW: 43, hemW: 45, length: NECK_Y + 126, armhole: 27, sleeveLen: 106, cuffW: 18, sleeveAngle: 78 },
  regular: {},
  relaxed: { shoulderW: 60, chestW: 57, waistW: 55, hemW: 55, length: NECK_Y + 134, armhole: 33, sleeveLen: 112, cuffW: 23, sleeveAngle: 75 },
};

/** The roll neck: a tall rib band above the shoulder line with a fold across it. */
function rollNeck(): { shape: string; fold: string; top: string; roll: string } {
  const o = NECK_W + 3.5;
  const top = NECK_Y - COLLAR_H;
  const shape = symmetric([CX, NECK_Y + 8], [
    Q([CX + NECK_W * 0.7, NECK_Y + 8], [CX + o, NECK_Y + 1]),
    L([CX + o, top + 4]),
    Q([CX + o, top], [CX + o - 4, top]),
    L([CX, top]),
  ]);
  const foldY = NECK_Y - COLLAR_H * 0.48;
  const roll = symmetric([CX, foldY], [L([CX + o, foldY]), L([CX + o, top + 4]), Q([CX + o, top], [CX + o - 4, top]), L([CX, top])]);
  return {
    shape,
    roll,
    fold: polyline([CX - o, foldY], [CX + o, foldY]),
    top: polyline([CX - o + 2, top + 4], [CX + o - 2, top + 4]),
  };
}

function turtleneck(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit] };
  const t = torso(spec);
  const trims = ribTrims(t, RIB, RIB);
  const neck = rollNeck();
  return piece({
    base: [fill(t.outline)],
    lines: [
      trims.fills,
      ink(stroke(t.outline), t.armSeams, trims.lines),
      fill(neck.shape, FILL2),
      shade(neck.roll, 0.08),
      ink(stroke(neck.shape), stroke(neck.fold), seam(neck.top)),
    ],
    clip: t.outline,
    extent: [t.outline, neck.shape],
    stripe: "h",
  });
}

export const TURTLENECK: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`turtleneck@${fit}`, turtleneck(fit)]),
);
TURTLENECK["turtleneck"] = TURTLENECK["turtleneck@regular"];
