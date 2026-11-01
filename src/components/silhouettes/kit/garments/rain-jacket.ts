/**
 * Rain jacket: a hooded shell. The hood with its drawcord, a full zip up to
 * the chin, vertical zipped hand pockets, a drawcord hem. Colorblock takes
 * the hood, yoke and upper sleeves.
 */
import { button, C, CX, fill, ink, path, piece, seam, shade, stroke } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, hood, jacket, JACKET_BASE, outerFit, roundNeck, zip, zipBetween, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, neckY: 42, neckW: 16, length: 182, chestW: 60, hemW: 58, sleeveLen: 120, cuffW: 24 };
const FITS = ["regular", "relaxed", "oversized"];

function rainJacket(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  const { neckW, neckY } = dims;
  const opening = 9;
  const spec: JacketSpec = { ...dims, neck: roundNeck(neckW, neckY, opening) };
  const j = jacket(spec);
  const h = hood(neckW, neckY, 20 + Math.max(0, dims.shoulderW - 60) * 0.35, opening, 12);
  const hemY = j.hemY;
  const z = zip(CX, neckY + opening + 0.5, hemY - 1);
  // Hood drawcord: grommets at the bottom of the opening, cords hanging down.
  const grommetY = neckY + opening + 4;
  const cord = (x: number, k: number) => path([x, grommetY + 2], [C([x + 1.5 * k, grommetY + 10], [x + 0.5 * k, grommetY + 16], [x + 2 * k, grommetY + 24])]);
  // Vertical zipped hand pockets.
  const px = CX + dims.hemW * 0.42;
  const pocket = zipBetween([px, j.bodyY(0.4)], [px, j.bodyY(0.72)], { slider: false, tape: 2.6 });
  const pocketL = zipBetween([2 * CX - px, j.bodyY(0.4)], [2 * CX - px, j.bodyY(0.72)], { slider: false, tape: 2.6 });
  // Hem drawcord: a channel with cord ends at the sides.
  const channel = seam(j.hemLine(5, 1));
  const hemCord = (k: number) => stroke(path([CX + (dims.hemW - 8) * k, hemY - 0.5], [C([CX + (dims.hemW - 8) * k, hemY + 4], [CX + (dims.hemW - 9) * k, hemY + 6], [CX + (dims.hemW - 10) * k, hemY + 7])]));
  return piece({
    base: [fill(h.back), fill(j.outline)],
    lines: [
      fill(h.lining),
      shade(h.lining, 0.26),
      ink(
        stroke(h.back),
        seam(h.seam),
        stroke(j.edge),
        j.armSeams,
        j.cuffLines(5),
        channel,
        z.strokes,
        pocket.strokes,
        pocketL.strokes,
        stroke(cord(CX - 7, -1)),
        stroke(cord(CX + 7, 1)),
        hemCord(1),
        hemCord(-1),
        stroke(h.lining),
      ),
      button(CX - 7, grommetY, 1.5),
      button(CX + 7, grommetY, 1.5),
      z.slider,
    ],
    clip: h.back + j.outline,
    extent: [h.back, j.outline],
    stripe: "h",
    block: j.yokePanel(j.armpit[1] + 6),
  });
}

export const RAIN_JACKET: Record<string, KitPiece> = fitTable("rain-jacket", FITS, "regular", rainJacket);
