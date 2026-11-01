/**
 * Polo: a short-sleeve knit with a flat folded collar, a two-button placket
 * and ribbed sleeve bands.
 */
import { CX, FILL2, fill, ink, mirrored, piece, seam, stroke } from "../draw";
import { foldCollar, placket, vNeckUnder } from "../parts-tops";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";

const NECK_Y = 22;
const NECK_W = 15;
const BAND = 5;

const BASE: Omit<TorsoSpec, "neck"> = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 58,
  shoulderDrop: 9,
  chestW: 55,
  hemW: 54,
  length: 144,
  armhole: 30,
  sleeveLen: 36,
  cuffW: 27,
  sleeveAngle: 28,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 54, chestW: 50, waistW: 45, hemW: 47, length: 140, armhole: 27, sleeveLen: 32, cuffW: 23, sleeveAngle: 30 },
  regular: {},
  relaxed: { shoulderW: 62, chestW: 60, hemW: 59, length: 148, armhole: 33, sleeveLen: 39, cuffW: 30 },
  oversized: { shoulderW: 72, shoulderDrop: 13, chestW: 71, hemW: 70, length: 162, armhole: 40, sleeveLen: 42, cuffW: 36, sleeveAngle: 34 },
  boxy: { shoulderW: 70, shoulderDrop: 11, chestW: 69, hemW: 69, length: 130, armhole: 38, sleeveLen: 36, cuffW: 34, sleeveAngle: 30 },
};

function polo(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit], neck: vNeckUnder(NECK_W, NECK_Y) };
  const t = torso(spec);
  // A soft knit collar: shorter, wider-set points than a shirt's.
  const collar = foldCollar(NECK_W, NECK_Y, {
    back: NECK_W + 6,
    meet: [CX + 2.5, NECK_Y + 14],
    point: [CX + 14, NECK_Y + 32],
    bow: [CX + NECK_W + 9, NECK_Y + 16],
    throat: NECK_Y + 11,
  });
  const p = placket(NECK_Y + 15, NECK_Y + 41, 3.5, 2, true, 1.7);
  const band = t.cuffBand(BAND);
  return piece({
    base: [fill(t.outline)],
    lines: [
      fill(band, FILL2),
      fill(mirrored(band), FILL2),
      ink(stroke(t.outline), t.armSeams, t.cuffLines(BAND), seam(t.hemLine(4)), p.lines),
      p.buttons,
      collar.fills,
      ink(collar.lines),
    ],
    clip: t.outline,
    stripe: "h",
    logo: [CX + spec.chestW * 0.45, t.bodyY(0.14), 12],
  });
}

export const POLO: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`polo@${fit}`, polo(fit)]),
);
POLO["polo"] = POLO["polo@regular"];
