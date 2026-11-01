/**
 * Puffer: a quilted down jacket. Horizontal baffles across the body and
 * sleeves, the sides bulging between them, a tall stand collar, a full zip
 * and slanted hand pockets.
 */
import { CX, fill, ink, mirrored, path, piece, Q, seam, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, jacket, JACKET_BASE, mirrorPt, outerFit, roundNeck, standCollar, weltPocket, zip, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 170, chestW: 62, hemW: 60, cuffW: 26, armhole: 36 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const PITCH = 17;

function puffer(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  dims.hemW = dims.chestW - 2;
  const { neckW, neckY } = dims;
  const spec: JacketSpec = { ...dims, neck: roundNeck(neckW, neckY, 6), scallop: { pitch: PITCH, depth: 2.1 } };
  const j = jacket(spec);
  const collar = standCollar(neckW, neckY, 12);
  const z = zip(CX, collar.holeY, j.hemY - 1);
  // Body baffles: one seam per bulge boundary, bowed down a little, either side of the zip.
  const baffles = j.baffles
    .map((y) => {
      const w = j.halfW(y) - 0.6;
      const right = path([CX + 3.8, y], [Q([CX + w * 0.5, y + 2], [CX + w, y])]);
      return seam(right) + seam(mirrored(right));
    })
    .join("");
  // A baffle across the chest above the armpit too.
  const chestY = j.armpit[1] - PITCH * 0.55;
  const chest = path([CX + 3.8, chestY], [Q([CX + dims.chestW * 0.5, chestY + 2], [j.armpit[0] - 3, chestY])]);
  // Sleeve baffles, perpendicular to the sleeve.
  const sleeves: string[] = [];
  for (let d = PITCH * 0.9; d < dims.sleeveLen - 6; d += PITCH) {
    const line = j.sleeveLine(d);
    sleeves.push(seam(line), seam(mirrored(line)));
  }
  // Hand pockets: slanted welts between two baffles.
  const py = j.bodyY(0.5);
  const a: Pt = [CX + 11, py];
  const b: Pt = [CX + j.halfW(py + 15) - 9, py + 15];
  const pockets = weltPocket(a, b) + weltPocket(mirrorPt(a), mirrorPt(b));
  return piece({
    base: [fill(j.outline)],
    lines: [
      collar.fills,
      ink(stroke(j.edge), j.armSeams, baffles, seam(chest), seam(mirrored(chest)), ...sleeves, j.cuffLines(5), z.strokes, pockets),
      collar.lines,
      z.slider,
    ],
    clip: j.outline,
    stripe: "h",
    block: j.sleevePanel() + mirrored(j.sleevePanel()),
  });
}

export const PUFFER: Record<string, KitPiece> = fitTable("puffer", FITS, "regular", puffer);
