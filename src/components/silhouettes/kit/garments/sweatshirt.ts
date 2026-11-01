/**
 * Sweatshirt: fleece-backed cotton with deep rib cuffs and hem, a ribbed crew
 * neck and the classic V-stitch insert below it.
 */
import { CX, FILL2, fill, ink, L, mirrored, path, piece, polyline, stroke } from "../draw";
import { ribTrims } from "../parts-tops";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;
const NECK_W = 16;
const NECK_D = 15;
const RIB = 10;

const BASE: Omit<TorsoSpec, "neckW" | "neckY"> = {
  shoulderW: 61,
  shoulderDrop: 9,
  chestW: 60,
  hemW: 56,
  length: 158,
  armhole: 34,
  sleeveLen: 112,
  cuffW: 25,
  sleeveAngle: 75,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 56, chestW: 54, waistW: 50, hemW: 50, length: 152, armhole: 31, sleeveLen: 108, cuffW: 22, sleeveAngle: 77 },
  regular: {},
  relaxed: { shoulderW: 65, chestW: 65, hemW: 61, length: 162, armhole: 37, sleeveLen: 114, cuffW: 27 },
  oversized: { shoulderW: 75, shoulderDrop: 13, chestW: 75, hemW: 72, length: 178, armhole: 44, sleeveLen: 122, cuffW: 31, sleeveAngle: 73 },
  boxy: { shoulderW: 73, shoulderDrop: 11, chestW: 72, hemW: 72, length: 142, armhole: 42, sleeveLen: 112, cuffW: 30, sleeveAngle: 74 },
};

function sweatshirt(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit], neckW: NECK_W, neckY: NECK_Y };
  const t = torso(spec);
  const rib = crewRib(NECK_W, NECK_Y, NECK_D, 4);
  const trims = ribTrims(t, RIB, RIB);
  // The V insert: a rib triangle hanging from the neck band.
  const vTop = NECK_Y + NECK_D;
  const notch = path([CX - 6, vTop - 0.5], [L([CX + 6, vTop - 0.5]), L([CX, vTop + 9])], true);
  const graphicTop = vTop + 14;
  const graphicBottom = spec.length - RIB - 10;
  const graphicSize = Math.min(Math.round(spec.chestW * 0.78), Math.round(graphicBottom - graphicTop));
  return piece({
    base: [fill(t.outline)],
    lines: [
      rib.fills,
      trims.fills,
      fill(notch, FILL2),
      ink(stroke(t.outline), t.armSeams, trims.lines, stroke(polyline([CX - 6, vTop], [CX, vTop + 9], [CX + 6, vTop]))),
      rib.lines,
    ],
    clip: t.outline,
    stripe: "h",
    graphic: [CX, (graphicTop + graphicBottom) / 2, graphicSize],
    logo: [CX + spec.chestW * 0.42, t.bodyY(0.1), 13],
    block: t.sleevePanel() + mirrored(t.sleevePanel()),
  });
}

export const SWEATSHIRT: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`sweatshirt@${fit}`, sweatshirt(fit)]),
);
SWEATSHIRT["sweatshirt"] = SWEATSHIRT["sweatshirt@regular"];
