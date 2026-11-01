/**
 * Henley: a long-sleeve tee with a short three-button placket under the
 * ribbed crew neck, and rib cuffs.
 */
import { CX, FILL2, fill, ink, mirrored, piece, seam, stroke } from "../draw";
import { placket } from "../parts-tops";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;
const NECK_W = 15;
const NECK_D = 15;
const CUFF = 5;

const BASE: Omit<TorsoSpec, "neckW" | "neckY"> = {
  shoulderW: 58,
  shoulderDrop: 9,
  chestW: 55,
  hemW: 54,
  length: 142,
  armhole: 30,
  sleeveLen: 110,
  cuffW: 22,
  sleeveAngle: 75,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 54, chestW: 50, waistW: 45, hemW: 47, length: 138, armhole: 27, sleeveLen: 106, cuffW: 19, sleeveAngle: 77 },
  regular: {},
  relaxed: { shoulderW: 62, chestW: 60, hemW: 59, length: 146, armhole: 33, sleeveLen: 112, cuffW: 24 },
  oversized: { shoulderW: 72, shoulderDrop: 13, chestW: 71, hemW: 70, length: 160, armhole: 40, sleeveLen: 118, cuffW: 28, sleeveAngle: 73 },
  boxy: { shoulderW: 70, shoulderDrop: 11, chestW: 69, hemW: 69, length: 128, armhole: 38, sleeveLen: 110, cuffW: 26, sleeveAngle: 74 },
};

function henley(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit], neckW: NECK_W, neckY: NECK_Y };
  const t = torso(spec);
  const rib = crewRib(NECK_W, NECK_Y, NECK_D, 3.5);
  const p = placket(NECK_Y + NECK_D, NECK_Y + NECK_D + 34, 3.5, 3);
  const cuff = t.cuffBand(CUFF);
  return piece({
    base: [fill(t.outline)],
    lines: [
      rib.fills,
      fill(cuff, FILL2),
      fill(mirrored(cuff), FILL2),
      ink(stroke(t.outline), t.armSeams, t.cuffLines(CUFF), seam(t.hemLine(4)), p.lines),
      rib.lines,
      p.buttons,
    ],
    clip: t.outline,
    stripe: "h",
    logo: [CX + spec.chestW * 0.45, t.bodyY(0.12), 12],
  });
}

export const HENLEY: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`henley@${fit}`, henley(fit)]),
);
HENLEY["henley"] = HENLEY["henley@regular"];
