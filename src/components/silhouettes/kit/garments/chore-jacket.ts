/**
 * Chore jacket: the French work coat. Small point collar, a plain button
 * front, three big patch pockets (two at the hips, one on the chest), a
 * straight boxy body.
 */
import { button, CX, fill, ink, L, piece, polyline, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { pointCollar } from "./shirt";
import { fitTable, jacket, JACKET_BASE, outerFit, patchPocket, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 174, chestW: 59, hemW: 59, cuffW: 24 };
const FITS = ["regular", "relaxed", "oversized"];

function choreJacket(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  const { neckW, neckY } = dims;
  const spec: JacketSpec = { ...dims, neck: { start: [CX, neckY + 14], segs: [L([CX + neckW, neckY])] } };
  const j = jacket(spec);
  const collar = pointCollar(neckW, neckY);
  const hemY = j.hemY;
  // The overlapping front's edge, just left of the buttons.
  const frontEdge = polyline([CX - 3, neckY + 17], [CX - 3, hemY - 0.3]);
  const buttons: string[] = [];
  for (let y = neckY + 28; y < hemY - 12; y += 30) buttons.push(button(CX, y, 1.9));
  // Pockets: a chest pocket on the wearer's left, two large ones at the hips.
  const cw = Math.round(dims.chestW * 0.3);
  const chest = patchPocket(CX + 11, j.bodyY(0.06), cw, cw + 2);
  const hw = Math.round(dims.hemW * 0.48);
  const hipY = j.bodyY(0.58);
  const hipR = patchPocket(CX + dims.hemW - hw - 7, hipY, hw, hw * 0.92);
  const hipL = patchPocket(CX - dims.hemW + 7, hipY, hw, hw * 0.92);
  return piece({
    base: [fill(j.outline)],
    lines: [
      collar.fills,
      ink(stroke(j.edge), j.armSeams, j.cuffLines(3), seam(j.hemLine(3)), stroke(frontEdge), chest, hipR, hipL),
      ...buttons,
      collar.lines,
    ],
    clip: j.outline,
    stripe: "v",
  });
}

export const CHORE_JACKET: Record<string, KitPiece> = fitTable("chore-jacket", FITS, "regular", choreJacket);
