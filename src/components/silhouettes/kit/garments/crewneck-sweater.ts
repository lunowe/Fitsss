/**
 * Crewneck sweater: a knit with long sleeves, a ribbed crew neck and narrow
 * rib bands at the cuffs and hem.
 */
import { fill, ink, mirrored, piece, stroke } from "../draw";
import { chestAnchors, ribTrims, topFit } from "../parts-tops";
import { fitTable } from "../parts-outer";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;
const NECK_W = 15;
const RIB = 7;

const BASE: TorsoSpec = {
  neckW: NECK_W,
  neckY: NECK_Y,
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

const FITS = ["fitted", "regular", "relaxed", "oversized", "boxy"];

function sweater(fit: string): KitPiece {
  const spec = topFit(BASE, fit);
  const t = torso(spec);
  const rib = crewRib(NECK_W, NECK_Y, 15, 4);
  const trims = ribTrims(t, RIB, RIB);
  return piece({
    base: [fill(t.outline)],
    lines: [rib.fills, trims.fills, ink(stroke(t.outline), t.armSeams, trims.lines), rib.lines],
    clip: t.outline,
    stripe: "h",
    logo: chestAnchors(t).logo,
    block: t.sleevePanel() + mirrored(t.sleevePanel()),
  });
}

export const SWEATER: Record<string, KitPiece> = fitTable("crewneck-sweater", FITS, "regular", sweater);
