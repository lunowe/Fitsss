/**
 * Crewneck sweater: a knit with long sleeves, a ribbed crew neck and narrow
 * rib bands at the cuffs and hem.
 */
import { CX, fill, ink, mirrored, piece, stroke } from "../draw";
import { ribTrims } from "../parts-tops";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;
const NECK_W = 15;
const RIB = 7;

const BASE: Omit<TorsoSpec, "neckW" | "neckY"> = {
  shoulderW: 58,
  shoulderDrop: 9,
  chestW: 56,
  hemW: 53,
  length: 150,
  armhole: 32,
  sleeveLen: 112,
  cuffW: 22,
  sleeveAngle: 75,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 54, chestW: 51, waistW: 46, hemW: 47, length: 146, armhole: 29, sleeveLen: 108, cuffW: 19, sleeveAngle: 77 },
  regular: {},
  relaxed: { shoulderW: 62, chestW: 61, hemW: 58, length: 154, armhole: 35, sleeveLen: 114, cuffW: 24 },
  oversized: { shoulderW: 72, shoulderDrop: 13, chestW: 71, hemW: 68, length: 168, armhole: 42, sleeveLen: 120, cuffW: 28, sleeveAngle: 73 },
  boxy: { shoulderW: 70, shoulderDrop: 11, chestW: 69, hemW: 69, length: 136, armhole: 40, sleeveLen: 112, cuffW: 26, sleeveAngle: 74 },
};

function sweater(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit], neckW: NECK_W, neckY: NECK_Y };
  const t = torso(spec);
  const rib = crewRib(NECK_W, NECK_Y, 15, 4);
  const trims = ribTrims(t, RIB, RIB);
  return piece({
    base: [fill(t.outline)],
    lines: [rib.fills, trims.fills, ink(stroke(t.outline), t.armSeams, trims.lines), rib.lines],
    clip: t.outline,
    stripe: "h",
    logo: [CX + spec.chestW * 0.42, t.bodyY(0.12), 13],
    block: t.sleevePanel() + mirrored(t.sleevePanel()),
  });
}

export const SWEATER: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`crewneck-sweater@${fit}`, sweater(fit)]),
);
SWEATER["crewneck-sweater"] = SWEATER["crewneck-sweater@regular"];
