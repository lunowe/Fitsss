/**
 * Quarter-zip: a knit pullover with a ribbed funnel collar, a short zip from
 * the collar's top to the chest, and rib cuffs and hem.
 */
import { FILL2, fill, ink, mirrored, piece, stroke } from "../draw";
import { ribTrims, standCollar, topFit, zip } from "../parts-tops";
import { fitTable } from "../parts-outer";
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

const FITS = ["fitted", "regular", "relaxed", "oversized", "boxy"];

function quarterZip(fit: string): KitPiece {
  const spec = topFit(BASE, fit);
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

export const QUARTER_ZIP: Record<string, KitPiece> = fitTable("quarter-zip", FITS, "regular", quarterZip);
