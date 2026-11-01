/**
 * Trench coat: double-breasted and knee length, with wide lapels, the storm
 * flap over the right chest, epaulettes, a buckled belt, slanted flap
 * pockets and sleeve straps. The skirt flares gently to the hem.
 */
import { button, CX, fill, ink, L, path, piece, Q, seam, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { belt, cuffStraps, epaulettes, fitTable, jacket, JACKET_BASE, lapels, mirrorPt, outerFit, slantFlap, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 240, chestW: 59, hemW: 68, sleeveLen: 122, cuffW: 24 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];

function trenchCoat(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  dims.hemW = dims.chestW + 9;
  dims.waistW = dims.chestW;
  const { neckW, neckY } = dims;
  const breakY = neckY + 62;
  const lp = lapels({ neckW, neckY, breakY, lapelW: 27, pointY: neckY + 26, notch: 9, collarW: 8 });
  const spec: JacketSpec = { ...dims, neck: lp.neck };
  const j = jacket(spec);
  const hemY = j.hemY;
  const beltY = j.bodyY(0.36);
  const wb = belt(beltY, j.halfW(beltY) + 0.5, 7);
  // The overlapping front: from the break it runs out past the far button
  // column and straight down to the hem.
  const edgeX = CX - 21;
  const frontEdge = path([CX, breakY], [Q([CX - 4, breakY + 14], [edgeX, breakY + 20]), L([edgeX, hemY - 0.3])]);
  // Two columns of buttons, three rows.
  const buttons: string[] = [];
  for (let i = 0; i < 3; i++) {
    const y = breakY + 6 + i * 30;
    if (i === 1 && Math.abs(y - beltY - 3.5) < 9) continue;
    buttons.push(button(CX - 10.5, y, 2.1), button(CX + 10.5, y, 2.1));
  }
  // Gun flap over the right chest: it comes out from under the lapel, runs
  // along the armhole and ends just above the top buttons.
  const flapTop: Pt = [CX + 15, breakY - 21];
  const stormFlap = path(flapTop, [L([j.armpit[0] - 0.5, neckY + 27]), L([j.armpit[0] - 0.5, breakY - 4]), Q([CX + 20, breakY + 1], [CX + 3.5, breakY - 1])]);
  // Slanted flap pockets below the belt.
  const py = j.bodyY(0.5);
  const a: Pt = [CX + 12, py + 12];
  const b: Pt = [CX + j.halfW(py) - 8, py];
  const pocketR = slantFlap(a, b, 8);
  const pocketL = slantFlap(mirrorPt(b), mirrorPt(a), 8);
  const ep = epaulettes(j);
  return piece({
    base: [fill(j.outline)],
    lines: [
      lp.fills,
      ep.fills,
      pocketR.fill,
      pocketL.fill,
      wb.fills,
      ink(
        stroke(j.edge),
        j.armSeams,
        stroke(frontEdge),
        stroke(stormFlap),
        pocketR.lines,
        pocketL.lines,
        seam(j.hemLine(4)),
      ),
      ...buttons,
      cuffStraps(j, 12),
      ep.lines,
      wb.lines,
      lp.lines,
    ],
    clip: j.outline,
    stripe: "v",
  });
}

export const TRENCH_COAT: Record<string, KitPiece> = fitTable("trench-coat", FITS, "regular", trenchCoat);
