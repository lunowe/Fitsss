/**
 * Sweatshirt: fleece-backed cotton with deep rib cuffs and hem, a ribbed crew
 * neck and the classic V-stitch insert below it.
 */
import { CX, fill, FILL2, ink, L, mirrored, path, piece, polyline, stroke } from "../draw";
import { chestAnchors, ribTrims, topFit } from "../parts-tops";
import { fitTable } from "../parts-outer";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;
const NECK_W = 16;
const NECK_D = 15;
const RIB = 10;

const BASE: TorsoSpec = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 61,
  shoulderDrop: 9,
  chestW: 60,
  hemW: 56,
  length: 158,
  armhole: 34,
  sleeveLen: 112,
  cuffW: 25,
  sleeveW: 27,
  hang: 2.5,
  sleeveAngle: 75,
};

const FITS = ["fitted", "regular", "relaxed", "oversized", "boxy"];

function sweatshirt(fit: string): KitPiece {
  const spec = topFit(BASE, fit);
  const t = torso(spec);
  const rib = crewRib(NECK_W, NECK_Y, NECK_D, 4);
  const trims = ribTrims(t, RIB, RIB);
  // The V insert: a rib triangle hanging from the neck band.
  const vTop = NECK_Y + NECK_D;
  const notch = path([CX - 6, vTop - 0.5], [L([CX + 6, vTop - 0.5]), L([CX, vTop + 9])], true);
  const anchors = chestAnchors(t, { top: vTop + 12, bottom: spec.length - RIB - 6 });
  return piece({
    base: [fill(t.outline)],
    lines: [
      t.sleeveShade,
      rib.fills,
      trims.fills,
      fill(notch, FILL2),
      ink(stroke(t.edges), t.armSeams, trims.lines, stroke(polyline([CX - 6, vTop], [CX, vTop + 9], [CX + 6, vTop]))),
      rib.lines,
    ],
    clip: t.outline,
    panels: t.panels,
    stripe: "h",
    graphic: anchors.graphic,
    logo: anchors.logo,
    block: t.sleevePanel() + mirrored(t.sleevePanel()),
  });
}

export const SWEATSHIRT: Record<string, KitPiece> = fitTable("sweatshirt", FITS, "regular", sweatshirt);
