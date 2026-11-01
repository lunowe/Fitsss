/**
 * Bomber: the MA-1. A short, bloused body gathered into a deep rib hem, rib
 * collar and cuffs in the second color, a full zip and two slanted welt
 * pockets. Nothing else: the blouson shape is the identity.
 */
import { CX, FILL2, fill, ink, mirrored, piece, seam, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, jacket, JACKET_BASE, mirrorPt, outerFit, roundNeck, standCollar, weltPocket, zip, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 156, chestW: 61, hemW: 52, cuffW: 23, armhole: 34 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const RIB = 11;

function bomber(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  // Blouson: the body swells a little below the chest and gathers into the rib.
  dims.waistW = dims.chestW + 1.5;
  dims.hemW = dims.chestW - 9;
  const { neckW, neckY } = dims;
  const spec: JacketSpec = { ...dims, neck: roundNeck(neckW, neckY, 6) };
  const j = jacket(spec);
  const collar = standCollar(neckW, neckY, 8, { paint: FILL2 });
  const z = zip(CX, collar.holeY, j.hemY - 1);
  // Welt pockets, slanted in towards the center.
  const py = j.bodyY(0.52);
  const pA: Pt = [CX + 12, py];
  const pB: Pt = [CX + dims.chestW - 12, py + 15];
  const pockets = weltPocket(pA, pB) + weltPocket(mirrorPt(pA), mirrorPt(pB));
  return piece({
    base: [fill(j.outline)],
    lines: [
      collar.fills,
      fill(j.hemBand(RIB), FILL2),
      fill(j.cuffBand(RIB), FILL2),
      fill(mirrored(j.cuffBand(RIB)), FILL2),
      ink(stroke(j.edge), j.armSeams, j.cuffLines(RIB), seam(j.hemLine(RIB, 1)), z.strokes, pockets),
      collar.lines,
      z.slider,
    ],
    clip: j.outline,
    stripe: "h",
    block: j.sleevePanel() + mirrored(j.sleevePanel()),
  });
}

export const BOMBER: Record<string, KitPiece> = fitTable("bomber", FITS, "regular", bomber);
