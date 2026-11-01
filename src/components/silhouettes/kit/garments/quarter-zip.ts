/**
 * Quarter-zip: a knit pullover with a ribbed funnel collar, a short zip from
 * the collar's top to the chest, and rib cuffs and hem.
 */
import { FILL2, fill, ink, mirrored, piece, stroke } from "../draw";
import { ribTrims, standCollar, zip } from "../parts-tops";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";

const NECK_Y = 34;
const NECK_W = 15;
const COLLAR_H = 14;
const RIB = 7;

const BASE: TorsoSpec = {
  neckW: NECK_W,
  neckY: NECK_Y,
  neckDepth: 8,
  shoulderW: 58,
  shoulderDrop: 9,
  chestW: 56,
  hemW: 53,
  length: NECK_Y + 132,
  armhole: 32,
  sleeveLen: 112,
  cuffW: 22,
  sleeveAngle: 75,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 54, chestW: 51, waistW: 46, hemW: 47, length: NECK_Y + 128, armhole: 29, sleeveLen: 108, cuffW: 19, sleeveAngle: 77 },
  regular: {},
  relaxed: { shoulderW: 62, chestW: 61, hemW: 58, length: NECK_Y + 136, armhole: 35, sleeveLen: 114, cuffW: 24 },
  oversized: { shoulderW: 72, shoulderDrop: 13, chestW: 71, hemW: 68, length: NECK_Y + 150, armhole: 42, sleeveLen: 120, cuffW: 28, sleeveAngle: 73 },
  boxy: { shoulderW: 70, shoulderDrop: 11, chestW: 69, hemW: 69, length: NECK_Y + 118, armhole: 40, sleeveLen: 112, cuffW: 26, sleeveAngle: 74 },
};

function quarterZip(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit] };
  const t = torso(spec);
  const trims = ribTrims(t, RIB, RIB);
  const collar = standCollar(NECK_W, NECK_Y, COLLAR_H);
  const z = zip(NECK_Y - COLLAR_H, NECK_Y + 44);
  return piece({
    base: [fill(t.outline)],
    lines: [
      trims.fills,
      ink(stroke(t.outline), t.armSeams, trims.lines),
      fill(collar.shape, FILL2),
      ink(stroke(collar.shape), collar.lines, z.lines),
      fill(z.pull, FILL2),
      ink(stroke(z.pull)),
    ],
    clip: t.outline,
    extent: [t.outline, collar.shape],
    stripe: "h",
    block: t.sleevePanel() + mirrored(t.sleevePanel()),
  });
}

export const QUARTER_ZIP: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`quarter-zip@${fit}`, quarterZip(fit)]),
);
QUARTER_ZIP["quarter-zip"] = QUARTER_ZIP["quarter-zip@regular"];
