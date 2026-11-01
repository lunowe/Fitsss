/**
 * Puffer: a quilted down jacket. Big horizontal baffles across the body and
 * sleeves, every edge bulging between them, a tall stand collar and a full
 * zip. The volume is the piece; no pockets.
 */
import { CX, fill, ink, mirrored, path, piece, Q, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, jacket, JACKET_BASE, outerFit, roundNeck, standCollar, zip, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 170, chestW: 64, hemW: 62, cuffW: 27, armhole: 38, shoulderDrop: 8, sleeveLen: 116 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const PITCH = 21;

function puffer(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  dims.hemW = dims.chestW - 2;
  dims.waistW = dims.chestW;
  const { neckW, neckY } = dims;
  const spec: JacketSpec = { ...dims, neck: roundNeck(neckW, neckY, 6), scallop: { pitch: PITCH, depth: 3.2, sleeves: true } };
  const j = jacket(spec);
  const collar = standCollar(neckW, neckY, 12);
  const z = zip(CX, collar.holeY, j.hemY - 1);
  // Body baffles: one seam per bulge boundary, sagging a little, either side of the zip.
  const baffles = j.baffles
    .map((y) => {
      const w = j.halfW(y) - 0.6;
      const right = path([CX + 3.8, y], [Q([CX + w * 0.5, y + 2.6], [CX + w, y])]);
      return seam(right) + seam(mirrored(right));
    })
    .join("");
  // One across the chest above the armpit too.
  const chestY = j.armpit[1] - PITCH * 0.55;
  const chest = path([CX + 3.8, chestY], [Q([CX + dims.chestW * 0.5, chestY + 2.6], [j.armpit[0] - 3, chestY])]);
  // Sleeve baffles at the sleeve's own bulge boundaries.
  const sleeves = j.sleeveBaffles.map((d) => {
    const line = j.sleeveLine(d);
    return seam(line) + seam(mirrored(line));
  });
  return piece({
    base: [fill(j.outline)],
    lines: [
      collar.fills,
      ink(stroke(j.edge), j.armSeams, baffles, seam(chest), seam(mirrored(chest)), ...sleeves, j.cuffLines(5), z.strokes),
      collar.lines,
      z.slider,
    ],
    clip: j.outline,
    stripe: "h",
    block: j.sleevePanel() + mirrored(j.sleevePanel()),
  });
}

export const PUFFER: Record<string, KitPiece> = fitTable("puffer", FITS, "regular", puffer);
