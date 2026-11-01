/**
 * Blazer: single-breasted and tailored. Clean notch lapels, two buttons, a
 * welt chest pocket and two flap pockets, cutaway front corners, a little
 * waist suppression in every fit.
 */
import { button, CX, fill, ink, L, path, piece, Q, stroke } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, flap, jacket, JACKET_BASE, lapels, outerFit, weltPocket, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 186, chestW: 57, hemW: 56, sleeveLen: 120, cuffW: 23, shoulderDrop: 7 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];

function blazer(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  // Tailored: the waist pulls in and the skirt eases out again to the hem.
  dims.waistW = Math.min(dims.waistW ?? dims.chestW, dims.chestW - 4);
  dims.hemW = dims.chestW;
  const { neckW, neckY } = dims;
  const breakY = neckY + 82 + (dims.length - 186) * 0.4;
  const lp = lapels({ neckW, neckY, breakY, lapelW: 22, pointY: neckY + 22, notch: 8 });
  const cutaway = 7;
  const spec: JacketSpec = { ...dims, neck: lp.neck, cutaway };
  const j = jacket(spec);
  const hemY = j.hemY;
  // The overlapping front: its edge runs from the break to a rounded corner at the hem.
  const frontEdge = path([CX - 3, breakY + 1], [L([CX - 3, hemY - 8]), Q([CX - 3, hemY - 1.5], [CX - 8, hemY - 0.2])]);
  // Pockets: a welt on the chest, flaps at the hips.
  const chestY = j.bodyY(0.1);
  const welt = weltPocket([CX + 13, chestY + 1.5], [CX + 29, chestY], 3.5);
  const flapY = j.bodyY(0.62);
  const fw = Math.round(dims.hemW * 0.42);
  const fx = CX + 9;
  const flapR = flap(fx, flapY, fw, 7);
  const flapL = flap(2 * CX - fx - fw, flapY, fw, 7);
  return piece({
    base: [fill(j.outline)],
    lines: [
      lp.fills,
      flapR.fill,
      flapL.fill,
      ink(stroke(j.edge), j.armSeams, stroke(frontEdge), welt, flapR.lines, flapL.lines),
      button(CX, breakY + 1, 2.1),
      button(CX, breakY + 19, 2.1),
      lp.lines,
    ],
    clip: j.outline,
    stripe: "v",
  });
}

export const BLAZER: Record<string, KitPiece> = fitTable("blazer", FITS, "regular", blazer);
