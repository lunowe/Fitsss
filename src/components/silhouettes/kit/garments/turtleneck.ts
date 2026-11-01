/**
 * Turtleneck: a close knit with a tall ribbed roll neck folded over on itself,
 * long sleeves and narrow rib cuffs and hem.
 */
import { CX, FILL2, fill, ink, L, piece, polyline, Q, seam, shade, stroke, symmetric } from "../draw";
import { ribTrims, topFit } from "../parts-tops";
import { fitTable } from "../parts-outer";
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
  sleeveW: 23,
  hang: 2.5,
  sleeveAngle: 76,
};

const FITS = ["fitted", "regular", "relaxed"];

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
  const spec = topFit(BASE, fit);
  const t = torso(spec);
  const trims = ribTrims(t, RIB, RIB);
  const neck = rollNeck();
  return piece({
    base: [fill(t.outline)],
    lines: [
      t.sleeveShade,
      trims.fills,
      ink(stroke(t.edges), t.armSeams, trims.lines),
      fill(neck.shape, FILL2),
      shade(neck.roll, 0.08),
      ink(stroke(neck.shape), stroke(neck.fold), seam(neck.top)),
    ],
    clip: t.outline,
    panels: t.panels,
    extent: [t.outline, neck.shape],
    stripe: "h",
  });
}

export const TURTLENECK: Record<string, KitPiece> = fitTable("turtleneck", FITS, "regular", turtleneck);
