/**
 * Wool coat: a single-breasted overcoat to the knee. Notched lapels with a
 * low break, three buttons, flap pockets at the hips, turn-back cuffs, a
 * straight body that eases out a little to the hem.
 */
import { button, CX, fill, ink, L, path, piece, Q, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, flap, jacket, JACKET_BASE, lapels, outerFit, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 228, chestW: 59, hemW: 63, sleeveLen: 122, cuffW: 24 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];

function woolCoat(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  dims.hemW = dims.chestW + 4;
  dims.waistW = fit === "fitted" ? dims.chestW - 3 : dims.chestW;
  const { neckW, neckY } = dims;
  const breakY = neckY + 70;
  const lp = lapels({ neckW, neckY, breakY, lapelW: 24, pointY: neckY + 25, notch: 8, collarW: 7 });
  const spec: JacketSpec = { ...dims, neck: lp.neck };
  const j = jacket(spec);
  const hemY = j.hemY;
  const frontEdge = path([CX - 3, breakY + 1], [L([CX - 3, hemY - 6]), Q([CX - 3, hemY - 1], [CX - 7, hemY - 0.3])]);
  const buttons: string[] = [];
  for (let i = 0; i < 3; i++) buttons.push(button(CX, breakY + 2 + i * 28, 2.2));
  const flapY = j.bodyY(0.5);
  const fw = Math.round(dims.hemW * 0.4);
  const fx = CX + 11;
  const flapR = flap(fx, flapY, fw, 8);
  const flapL = flap(2 * CX - fx - fw, flapY, fw, 8);
  return piece({
    base: [fill(j.outline)],
    lines: [
      lp.fills,
      flapR.fill,
      flapL.fill,
      ink(stroke(j.edge), j.armSeams, j.cuffLines(12), stroke(frontEdge), flapR.lines, flapL.lines, seam(j.hemLine(4))),
      ...buttons,
      lp.lines,
    ],
    clip: j.outline,
    stripe: "v",
  });
}

export const WOOL_COAT: Record<string, KitPiece> = fitTable("wool-coat", FITS, "regular", woolCoat);
