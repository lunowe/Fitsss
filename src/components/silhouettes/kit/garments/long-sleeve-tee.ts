/**
 * Long-sleeve tee: the tee's body and ribbed crew neck with long, straight
 * sleeves; plain stitched cuffs and hem (no rib bands, which would make it a
 * sweater).
 */
import { fill, ink, mirrored, piece, seam, stroke } from "../draw";
import { chestAnchors, topFit } from "../parts-tops";
import { fitTable } from "../parts-outer";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;
const NECK_W = 15;

const BASE: TorsoSpec = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 58,
  shoulderDrop: 9,
  chestW: 55,
  hemW: 54,
  length: 149,
  armhole: 30,
  sleeveLen: 110,
  cuffW: 22,
  sleeveAngle: 75,
};

const FITS = ["fitted", "regular", "relaxed", "oversized", "boxy"];

function longSleeveTee(fit: string): KitPiece {
  const spec = topFit(BASE, fit);
  const t = torso(spec);
  const rib = crewRib(NECK_W, NECK_Y, 15, 3.5);
  const anchors = chestAnchors(t);
  return piece({
    base: [fill(t.outline)],
    lines: [rib.fills, ink(stroke(t.outline), t.armSeams, t.cuffLines(4), seam(t.hemLine(4))), rib.lines],
    clip: t.outline,
    stripe: "h",
    graphic: anchors.graphic,
    logo: anchors.logo,
    block: t.sleevePanel() + mirrored(t.sleevePanel()),
  });
}

export const LONG_SLEEVE_TEE: Record<string, KitPiece> = fitTable("long-sleeve-tee", FITS, "regular", longSleeveTee);
