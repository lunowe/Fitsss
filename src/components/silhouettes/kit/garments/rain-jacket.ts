/**
 * Rain jacket: a hooded shell, longer than a jacket and a little A-line. The
 * hood with its drawcord, a storm flap down the center front with the zip's
 * slider showing at the throat, two slanted welt pockets. Colorblock takes the
 * hood, yoke and upper sleeves.
 */
import { button, C, CX, fill, ink, path, piece, polyline, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, hood, jacket, JACKET_BASE, type JacketSpec, mirrorPt, outerFit, roundNeck, weltPocket, withPanels, zipSlider } from "../parts-outer";

const BASE = { ...JACKET_BASE, neckY: 42, neckW: 16, length: 190, chestW: 60, hemW: 63, sleeveLen: 120, cuffW: 24, shoulderDrop: 10 };
const FITS = ["regular", "relaxed", "oversized"];
const FLAP = 5.5;

function rainJacket(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  dims.hemW = dims.chestW + 3;
  dims.waistW = dims.chestW;
  const { neckW, neckY } = dims;
  const opening = 9;
  const spec: JacketSpec = { ...dims, neck: roundNeck(neckW, neckY, opening) };
  const j = jacket(spec);
  const h = hood(neckW, neckY, dims.shoulderW * 0.36, opening);
  const hemY = j.hemY;
  // Storm flap: its free edge in ink on the left, its stitching on the right.
  const flapTop = neckY + opening + 0.5;
  const flapFree = polyline([CX - FLAP, flapTop], [CX - FLAP, hemY - 0.3]);
  const flapStitch = polyline([CX + FLAP, flapTop + 1], [CX + FLAP, hemY - 1]);
  // Hood drawcord: grommets at the bottom of the opening, short cords.
  const grommetY = neckY + opening - 2.5;
  const cord = (x: number, k: number) => path([x, grommetY + 2], [C([x + 1.5 * k, grommetY + 9], [x + 0.5 * k, grommetY + 14], [x + 2 * k, grommetY + 20])]);
  // Slanted welt hand pockets.
  const py = j.bodyY(0.55);
  const a: Pt = [CX + 13, py];
  const b: Pt = [CX + j.halfW(py + 14) - 10, py + 14];
  const pockets = weltPocket(a, b) + weltPocket(mirrorPt(a), mirrorPt(b));
  return withPanels(piece({
    base: [fill(h.back), fill(j.outline)],
    lines: [
      fill(h.lining),
      shade(h.lining, 0.26),
      ink(
        stroke(h.back),
        seam(h.seam),
        stroke(j.edge),
        stroke(h.lining),
        j.armSeams,
        j.cuffLines(5),
        seam(j.hemLine(4)),
        stroke(flapFree),
        seam(flapStitch),
        pockets,
        stroke(cord(CX - 7, -1)),
        stroke(cord(CX + 7, 1)),
      ),
      button(CX - 7, grommetY, 1.5),
      button(CX + 7, grommetY, 1.5),
      zipSlider(CX, flapTop + 1.5),
    ],
    clip: h.back + j.outline,
    extent: [h.back, j.outline],
    stripe: "h",
    block: j.yokePanel(j.armpit[1] + 6),
  }), j.panels());
}

export const RAIN_JACKET: Record<string, KitPiece> = fitTable("rain-jacket", FITS, "regular", rainJacket);
