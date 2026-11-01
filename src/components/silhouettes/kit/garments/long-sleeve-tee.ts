/**
 * Long-sleeve tee: the tee's body and ribbed crew neck with long, straight
 * sleeves; plain stitched cuffs and hem (no rib bands, which would make it a
 * sweater).
 */
import { CX, fill, ink, mirrored, piece, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;
const NECK_W = 15;

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

function longSleeveTee(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit], neckW: NECK_W, neckY: NECK_Y };
  const t = torso(spec);
  const rib = crewRib(NECK_W, NECK_Y, 15, 3.5);
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

export const LONG_SLEEVE_TEE: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`long-sleeve-tee@${fit}`, longSleeveTee(fit)]),
);
LONG_SLEEVE_TEE["long-sleeve-tee"] = LONG_SLEEVE_TEE["long-sleeve-tee@regular"];
