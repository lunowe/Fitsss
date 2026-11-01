/**
 * Leather jacket: the biker. Wide lapels snapped down, the asymmetric main
 * zip running up from the hip, zipped chest and hip pockets, epaulettes, a
 * buckled waist belt and zipped cuffs.
 */
import { add, CX, fill, ink, L, mirrored, path, perp, piece, polyline, seam, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { belt, buttonAt, epaulettes, fitTable, jacket, JACKET_BASE, lapels, outerFit, zipBetween, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 158, chestW: 58, hemW: 54, cuffW: 22 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const BELT = 7;

function leatherJacket(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  const { neckW, neckY } = dims;
  const breakY = neckY + 50;
  const lp = lapels({ neckW, neckY, breakY, lapelW: 29, pointY: neckY + 28, notch: 10, collarW: 9 });
  const spec: JacketSpec = { ...dims, neck: lp.neck };
  const j = jacket(spec);
  const hemY = j.hemY;
  const beltY = hemY - BELT - 9;
  // Main zip: from the left hip diagonally up to the break, where the lapel takes over.
  const zipFoot: Pt = [CX - 14, beltY - 1];
  const zipHead: Pt = [CX + 1.5, breakY + 2];
  const main = zipBetween(zipHead, zipFoot);
  // The under-front's edge continues from the zip foot straight down through the belt.
  // Zipped pockets, slanted at the hips.
  const hipR = zipBetween([CX + 10, j.bodyY(0.58)], [CX + dims.hemW - 8, j.bodyY(0.42)], { slider: false, tape: 2.6 });
  const hipL = zipBetween([CX - dims.hemW + 8, j.bodyY(0.42)], [CX - 10, j.bodyY(0.58)], { slider: false, tape: 2.6 });
  // Cuff zips along the outer sleeve edge.
  const u = j.sleeveDir;
  const v = perp(u);
  const cuffA = add(add(j.cuffOuter, u, -1), v, 3);
  const cuffB = add(cuffA, u, -16);
  const cuffZ = zipBetween(cuffA, cuffB, { slider: false, tape: 2.4 });
  const cuffZL = zipBetween([2 * CX - cuffA[0], cuffA[1]], [2 * CX - cuffB[0], cuffB[1]], { slider: false, tape: 2.4 });
  const ep = epaulettes(j);
  const wb = belt(beltY, j.halfW(beltY), BELT);
  // Lapel snaps at the points.
  const snapR: Pt = [CX + 26, neckY + 25];
  return piece({
    base: [fill(j.outline)],
    lines: [
      lp.fills,
      ep.fills,
      wb.fills,
      ink(
        stroke(j.edge),
        j.armSeams,
        j.cuffLines(3),
        main.strokes,
        hipR.strokes,
        hipL.strokes,
        cuffZ.strokes,
        cuffZL.strokes,
        seam(polyline([CX + 8, j.bodyY(0.26)], [CX + 8, beltY - 1])),
        seam(mirrored(polyline([CX + 8, j.bodyY(0.26)], [CX + 8, beltY - 1]))),
        seam(path([zipFoot[0] - 3.2, zipFoot[1] + 1], [L([zipFoot[0] - 3.2, beltY])])),
      ),
      main.slider,
      ep.lines,
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
