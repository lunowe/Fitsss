/**
 * Parka: long, hooded, built for weather. A big hood lying behind the
 * shoulders, a snapped storm flap down the front, two bellows pockets at the
 * hips, a drawcord waist and a straight body to mid-thigh.
 */
import { button, CX, fill, ink, piece, polyline, seam, shade, stroke } from "../draw";
import type { KitPiece } from "../types";
import { drawcord, fitTable, flap, hood, jacket, JACKET_BASE, outerFit, patchPocket, roundNeck, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, neckY: 44, neckW: 16, length: 232, chestW: 62, hemW: 64, sleeveLen: 124, cuffW: 25, armhole: 36 };
const FITS = ["regular", "relaxed", "oversized"];

function parka(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  dims.hemW = dims.chestW + 2;
  const { neckW, neckY } = dims;
  const opening = 12;
  const spec: JacketSpec = { ...dims, neck: roundNeck(neckW, neckY, opening) };
  const j = jacket(spec);
  const h = hood(neckW, neckY, dims.shoulderW * 0.42, opening);
  const hemY = j.hemY;
  // Storm flap: a band down the center front, snapped shut.
  const flapW = 5.5;
  const flapEdge = (x: number) => polyline([x, neckY + opening + 0.5], [x, hemY - 0.3]);
  const waistY = j.bodyY(0.38);
  const snaps = [neckY + opening + 12, waistY - 16, j.bodyY(0.62), hemY - 22].map((y) => button(CX, y, 1.6));
  // Bellows pockets at the hips.
  const hipY = j.bodyY(0.58);
  const hw = Math.round(dims.hemW * 0.42);
  const hx = CX + dims.hemW - hw - 9;
  const hipFlapR = flap(hx, hipY, hw, 7);
  const hipFlapL = flap(2 * CX - hx - hw, hipY, hw, 7);
  const hipBagR = patchPocket(hx + 0.5, hipY + 5, hw - 1, hw * 0.85);
  const hipBagL = patchPocket(2 * CX - hx - hw + 0.5, hipY + 5, hw - 1, hw * 0.85);
  return piece({
    base: [fill(h.back), fill(j.outline)],
    lines: [
      fill(h.lining),
      shade(h.lining, 0.26),
      hipFlapR.fill,
      hipFlapL.fill,
      ink(
        stroke(h.back),
        seam(h.seam),
        stroke(j.edge),
        stroke(h.lining),
        j.armSeams,
        j.cuffLines(8),
        seam(j.hemLine(4)),
        seam(flapEdge(CX - flapW)),
        seam(flapEdge(CX + flapW)),
        hipBagR,
        hipBagL,
        hipFlapR.lines,
        hipFlapL.lines,
        drawcord(waistY, dims.chestW, 13, flapW + 3),
      ),
      ...snaps,
    ],
    clip: h.back + j.outline,
    extent: [h.back, j.outline],
    stripe: "h",
  });
}

export const PARKA: Record<string, KitPiece> = fitTable("parka", FITS, "regular", parka);
