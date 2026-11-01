/**
 * Bomber: the MA-1. Rib knit collar, cuffs and hem in the second color, a
 * full zip, bloused body, slanted welt pockets at the hips and the small
 * utility pocket on the upper sleeve.
 */
import { add, CX, FILL2, fill, ink, L, mirrored, path, perp, piece, seam, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, jacket, JACKET_BASE, mirrorPt, outerFit, roundNeck, standCollar, weltPocket, zip, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 160, chestW: 60, hemW: 53, cuffW: 23 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const RIB = 10;

function bomber(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  const { neckW, neckY } = dims;
  const spec: JacketSpec = { ...dims, neck: roundNeck(neckW, neckY, 6) };
  const j = jacket(spec);
  const collar = standCollar(neckW, neckY, 8, { paint: FILL2 });
  const z = zip(CX, collar.holeY, j.hemY - 1);
  // Welt pockets, slanted in towards the center.
  const py = j.bodyY(0.5);
  const pA: Pt = [CX + 12, py];
  const pB: Pt = [CX + dims.hemW - 10, py + 17];
  const pockets = weltPocket(pA, pB) + weltPocket(mirrorPt(pA), mirrorPt(pB));
  // Utility pocket on the upper left sleeve (the viewer's right).
  const u = j.sleeveDir;
  const v = perp(u);
  const p0 = add(add(j.shoulder, u, 26), v, 5);
  const sleevePocket = path(p0, [L(add(p0, u, 14)), L(add(add(p0, u, 14), v, 11)), L(add(p0, v, 11))], true);
  const penLine = path(add(p0, v, 4), [L(add(add(p0, u, 14), v, 4))]);
  return piece({
    base: [fill(j.outline)],
    lines: [
      collar.fills,
      fill(j.hemBand(RIB), FILL2),
      fill(j.cuffBand(RIB), FILL2),
      fill(mirrored(j.cuffBand(RIB)), FILL2),
      ink(
        stroke(j.edge),
        j.armSeams,
        j.cuffLines(RIB),
        seam(j.hemLine(RIB, 1)),
        z.strokes,
        pockets,
        seam(sleevePocket),
        seam(penLine),
      ),
      collar.lines,
      z.slider,
    ],
    clip: j.outline,
    stripe: "h",
    block: j.sleevePanel() + mirrored(j.sleevePanel()),
  });
}

export const BOMBER: Record<string, KitPiece> = fitTable("bomber", FITS, "regular", bomber);
