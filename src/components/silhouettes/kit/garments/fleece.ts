/**
 * Fleece: a full-zip pile fleece with a tall stand collar, two zipped hand
 * pockets and elastic cuffs and hem. Colorblock is the classic contrast
 * yoke across the chest, shoulders and collar.
 */
import { CX, FILL2, fill, ink, L, mirrored, path, piece, Q, seam, stroke } from "../draw";
import { ribTrims, standCollar, standNeck, zip } from "../parts-tops";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";

const NECK_Y = 36;
const NECK_W = 15;
const COLLAR_H = 15;
const TRIM = 6;

const BASE: Omit<TorsoSpec, "neck"> = {
  neckW: NECK_W + 3,
  neckY: NECK_Y,
  shoulderW: 61,
  shoulderDrop: 9,
  chestW: 60,
  hemW: 57,
  length: NECK_Y + 130,
  armhole: 34,
  sleeveLen: 114,
  cuffW: 25,
  sleeveAngle: 75,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  regular: {},
  relaxed: { shoulderW: 65, chestW: 65, hemW: 62, length: NECK_Y + 134, armhole: 37, sleeveLen: 116, cuffW: 27 },
  oversized: { shoulderW: 75, shoulderDrop: 13, chestW: 75, hemW: 72, length: NECK_Y + 150, armhole: 44, sleeveLen: 124, cuffW: 31, sleeveAngle: 73 },
};

function fleece(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit], neck: standNeck(NECK_W, NECK_Y) };
  const t = torso(spec);
  const collar = standCollar(NECK_W, NECK_Y, COLLAR_H);
  const trims = ribTrims(t, TRIM, TRIM);
  const z = zip(NECK_Y - COLLAR_H, spec.length - TRIM);
  // Hand pockets: slanted welt zips from the chest line down towards the hem.
  const top = t.bodyY(0.42);
  const bottom = t.bodyY(0.78);
  const welt = path([CX + spec.chestW * 0.72, top], [Q([CX + spec.chestW * 0.5, top + (bottom - top) * 0.55], [CX + spec.chestW * 0.3, bottom])]);
  const weltIn = path([CX + spec.chestW * 0.72 - 3.5, top + 1.5], [Q([CX + spec.chestW * 0.5 - 3, top + (bottom - top) * 0.55], [CX + spec.chestW * 0.3 - 3, bottom - 1])]);
  const yokeY = t.armpit[1] + 6;
  const block = path([-40, -40], [L([240, -40]), L([240, yokeY]), L([-40, yokeY])], true);
  // The collar is part of the silhouette: `standNeck` makes its bottom edge
  // the body's neckline, so it is fabric (and takes the colorblock).
  const neckSeam = path([CX - collar.halfW, NECK_Y + 2], [Q([CX - NECK_W * 0.7, NECK_Y + 9], [CX, NECK_Y + 9]), Q([CX + NECK_W * 0.7, NECK_Y + 9], [CX + collar.halfW, NECK_Y + 2])]);
  return piece({
    base: [fill(collar.shape), fill(t.outline)],
    lines: [
      trims.fills,
      ink(
        stroke(collar.shape),
        stroke(t.outline),
        collar.lines,
        seam(neckSeam),
        t.armSeams,
        trims.lines,
        stroke(welt),
        seam(weltIn),
        stroke(mirrored(welt)),
        seam(mirrored(weltIn)),
        z.lines,
      ),
      fill(z.pull, FILL2),
      ink(stroke(z.pull)),
    ],
    clip: collar.shape + t.outline,
    extent: [t.outline, collar.shape],
    block,
  });
}

export const FLEECE: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`fleece@${fit}`, fleece(fit)]),
);
FLEECE["fleece"] = FLEECE["fleece@regular"];
