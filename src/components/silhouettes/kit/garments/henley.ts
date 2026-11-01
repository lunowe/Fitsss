/**
 * Henley: a long-sleeve tee with a short three-button placket under the
 * ribbed crew neck, and rib cuffs.
 */
import { FILL2, fill, ink, mirrored, piece, seam, stroke } from "../draw";
import { chestAnchors, placket, topFit } from "../parts-tops";
import { fitTable } from "../parts-outer";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;
const NECK_W = 15;
const NECK_D = 15;
const CUFF = 5;

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

function henley(fit: string): KitPiece {
  const spec = topFit(BASE, fit);
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
    logo: chestAnchors(t).logo,
  });
}

export const HENLEY: Record<string, KitPiece> = fitTable("henley", FITS, "regular", henley);
