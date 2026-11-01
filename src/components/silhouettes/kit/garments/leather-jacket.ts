/**
 * Leather jacket: the biker. Wide lapels snapped down, the asymmetric main
 * zip running up from the hip to the lapel, the diagonal chest zip, a buckled
 * waist belt. The slant is the identity; the rest stays smooth leather.
 */
import { CX, fill, ink, piece, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { belt, buttonAt, fitTable, jacket, JACKET_BASE, lapels, outerFit, zipBetween, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 156, chestW: 58, hemW: 54, cuffW: 22 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const BELT = 7;

function leatherJacket(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  const { neckW, neckY } = dims;
  const breakY = neckY + 48;
  const lp = lapels({ neckW, neckY, breakY, lapelW: 29, pointY: neckY + 27, notch: 10, collarW: 9 });
  const spec: JacketSpec = { ...dims, neck: lp.neck };
  const j = jacket(spec);
  const hemY = j.hemY;
  const beltY = hemY - BELT - 8;
  // Main zip: from the left hip diagonally up to the break, where the lapel takes over.
  const zipFoot: Pt = [CX - 15, beltY - 1];
  const zipHead: Pt = [CX + 1.5, breakY + 2];
  const main = zipBetween(zipHead, zipFoot);
  // Chest zip pocket, diagonal on the viewer's right.
  const chest = zipBetween([CX + 12, j.bodyY(0.1)], [CX + dims.chestW - 9, j.bodyY(0.36)], { slider: false, single: true, tape: 2.6 });
  const wb = belt(beltY, j.halfW(beltY), BELT);
  // Lapel snaps at the points.
  const snapR: Pt = [CX + 26, neckY + 24];
  return piece({
    base: [fill(j.outline)],
    lines: [
      lp.fills,
      wb.fills,
      ink(stroke(j.edge), j.armSeams, j.cuffLines(3), main.strokes, chest.strokes),
      main.slider,
      wb.lines,
      lp.lines,
      buttonAt(snapR[0], snapR[1], 1.5),
      buttonAt(2 * CX - snapR[0], snapR[1], 1.5),
    ],
    clip: j.outline,
    stripe: "v",
  });
}

export const LEATHER_JACKET: Record<string, KitPiece> = fitTable("leather-jacket", FITS, "regular", leatherJacket);
