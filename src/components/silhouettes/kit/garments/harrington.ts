/**
 * Harrington: the G9. Stand collar buttoned at the throat with its check
 * lining showing inside, raglan sleeves, a full zip, slanted flap pockets,
 * rib cuffs and hem.
 */
import { button, CX, FILL2, fill, ink, mirrored, piece, seam, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, jacket, JACKET_BASE, type JacketSpec, mirrorPt, outerFit, roundNeck, slantFlap, standCollar, withPanels, zip } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 162, chestW: 58, hemW: 53, cuffW: 22 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const RIB = 9;

function harrington(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  const { neckW, neckY } = dims;
  const spec: JacketSpec = { ...dims, neck: roundNeck(neckW, neckY, 6) };
  const j = jacket(spec);
  const collar = standCollar(neckW, neckY, 9, { lining: FILL2 });
  const z = zip(CX, collar.baseY - 0.5, j.hemY - 1);
  // Slanted flap pockets at the hips.
  const py = j.bodyY(0.5);
  const a: Pt = [CX + 11, py + 13];
  const b: Pt = [CX + dims.hemW - 9, py];
  const flapR = slantFlap(a, b, 7);
  const flapL = slantFlap(mirrorPt(b), mirrorPt(a), 7);
  return withPanels(piece({
    base: [fill(j.outline)],
    lines: [
      collar.fills,
      fill(j.hemBand(RIB), FILL2),
      fill(j.cuffBand(RIB), FILL2),
      fill(mirrored(j.cuffBand(RIB)), FILL2),
      flapR.fill,
      flapL.fill,
      ink(
        stroke(j.edge),
        j.raglanSeams(),
        j.cuffLines(RIB),
        seam(j.hemLine(RIB, 1)),
        z.strokes,
        flapR.lines,
        flapL.lines,
      ),
      collar.lines,
      button(CX - 2.6, collar.holeY + 4.5, 1.4),
      button(CX + 2.6, collar.holeY + 4.5, 1.4),
      z.slider,
    ],
    clip: j.outline,
    stripe: "h",
  }), j.panels(true));
}

export const HARRINGTON: Record<string, KitPiece> = fitTable("harrington", FITS, "regular", harrington);
