/**
 * Parka: long, hooded, built for weather. A big hood lying behind the
 * shoulders, a snapped storm flap down the front, four flap pockets (two on
 * the chest, two bellows pockets at the hips), a drawcord waist and a
 * straight body to mid-thigh.
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
  const h = hood(neckW, neckY, 22 + Math.max(0, dims.shoulderW - 60) * 0.35, opening, 13);
  const hemY = j.hemY;
  // Storm flap: a band down the center front, snapped shut.
  const flapW = 5.5;
  const flapEdge = (x: number) => polyline([x, neckY + opening + 0.5], [x, hemY - 0.3]);
  const snaps: string[] = [];
  for (let y = neckY + opening + 10; y < hemY - 8; y += 27) snaps.push(button(CX, y, 1.6));
  // Pockets.
  const chestY = j.bodyY(0.06);
  const cw = 17;
  const cx = CX + 12;
  const chestFlapR = flap(cx, chestY, cw, 6);
  const chestFlapL = flap(2 * CX - cx - cw, chestY, cw, 6);
  const chestBagR = patchPocket(cx + 0.5, chestY + 4, cw - 1, 16);
  const chestBagL = patchPocket(2 * CX - cx - cw + 0.5, chestY + 4, cw - 1, 16);
  const hipY = j.bodyY(0.6);
  const hw = Math.round(dims.hemW * 0.44);
  const hx = CX + dims.hemW - hw - 8;
  const hipFlapR = flap(hx, hipY, hw, 7);
  const hipFlapL = flap(2 * CX - hx - hw, hipY, hw, 7);
  const hipBagR = patchPocket(hx + 0.5, hipY + 5, hw - 1, hw * 0.85);
  const hipBagL = patchPocket(2 * CX - hx - hw + 0.5, hipY + 5, hw - 1, hw * 0.85);
  const waistY = j.bodyY(0.4);
  return piece({
    base: [fill(h.back), fill(j.outline)],
    lines: [
      fill(h.lining),
      shade(h.lining, 0.26),
      chestFlapR.fill,
      chestFlapL.fill,
      hipFlapR.fill,
      hipFlapL.fill,
      ink(
        stroke(h.back),
        seam(h.seam),
        stroke(j.edge),
        j.armSeams,
        j.cuffLines(8),
        seam(j.hemLine(4)),
        seam(flapEdge(CX - flapW)),
        seam(flapEdge(CX + flapW)),
        chestBagR,
        chestBagL,
        hipBagR,
        hipBagL,
        chestFlapR.lines,
        chestFlapL.lines,
        hipFlapR.lines,
        hipFlapL.lines,
        drawcord(waistY, dims.chestW, 14, flapW + 3),
        stroke(h.lining),
      ),
      ...snaps,
    ],
    clip: h.back + j.outline,
    extent: [h.back, j.outline],
    stripe: "h",
  });
}

export const PARKA: Record<string, KitPiece> = fitTable("parka", FITS, "regular", parka);
