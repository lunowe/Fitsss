/**
 * Polo: a short-sleeve knit with a flat folded collar, a two-button placket
 * and ribbed sleeve bands.
 */
import { CX, FILL2, fill, ink, mirrored, piece, seam, stroke } from "../draw";
import { chestAnchors, foldCollar, placket, topFit, vNeckUnder } from "../parts-tops";
import { fitTable } from "../parts-outer";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";

const NECK_Y = 22;
const NECK_W = 15;
const BAND = 5;

const BASE: Omit<TorsoSpec, "neck"> = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 58,
  shoulderDrop: 9,
  chestW: 55,
  hemW: 54,
  length: 150,
  armhole: 30,
  sleeveLen: 36,
  cuffW: 27,
  sleeveAngle: 28,
};

const FITS = ["fitted", "regular", "relaxed", "oversized", "boxy"];

function polo(fit: string): KitPiece {
  const spec: TorsoSpec = { ...topFit(BASE, fit), neck: vNeckUnder(NECK_W, NECK_Y) };
  const t = torso(spec);
  // A soft knit collar: shorter, wider-set points than a shirt's.
  const collar = foldCollar(NECK_W, NECK_Y, {
    back: NECK_W + 6,
    meet: [CX + 2.5, NECK_Y + 14],
    point: [CX + 14, NECK_Y + 32],
    bow: [CX + NECK_W + 9, NECK_Y + 16],
    throat: NECK_Y + 11,
  });
  const p = placket(NECK_Y + 15, NECK_Y + 41, 3.5, 2, true, 1.7);
  const band = t.cuffBand(BAND);
  return piece({
    base: [fill(t.outline)],
    lines: [
      fill(band, FILL2),
      fill(mirrored(band), FILL2),
      ink(stroke(t.edges), t.armSeams, t.cuffLines(BAND), seam(t.hemLine(4)), p.lines),
      p.buttons,
      collar.fills,
      ink(collar.lines),
    ],
    clip: t.outline,
    panels: t.panels,
    stripe: "h",
    logo: chestAnchors(t).logo,
  });
}

export const POLO: Record<string, KitPiece> = fitTable("polo", FITS, "regular", polo);
