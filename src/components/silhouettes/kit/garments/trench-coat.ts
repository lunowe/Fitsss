/**
 * Trench coat: double-breasted and knee length. Wide lapels, the gun flap
 * over the right chest, a buckled belt, two columns of buttons and two
 * slanted pocket openings; the skirt flares gently to the hem.
 */
import { button, CX, fill, ink, L, path, piece, polyline, Q, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { belt, fitTable, jacket, JACKET_BASE, type JacketSpec, lapels, mirrorPt, outerFit, withPanels } from "../parts-outer";

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
  // Two columns of buttons: two rows above the belt, one below.
  const buttons: string[] = [];
  for (const y of [breakY + 8, beltY - 12, beltY + 26]) buttons.push(button(CX - 10.5, y, 2.1), button(CX + 10.5, y, 2.1));
  // Gun flap over the right chest: it comes out from under the lapel and runs
  // across to the armhole in one curve.
  const flapTop: Pt = [CX + 14, breakY - 22];
  const stormFlap = path(flapTop, [L([j.armpit[0] - 0.5, neckY + 27]), L([j.armpit[0] - 0.5, breakY - 6]), Q([CX + 22, breakY - 1], [CX + 3.5, breakY - 2])]);
  // Slanted pocket openings below the belt: one line each, no flaps, so the
  // coat stays legible at closet size under its lapels, belt and buttons.
  const py = j.bodyY(0.55);
  const a: Pt = [CX + 13, py + 12];
  const b: Pt = [CX + j.halfW(py) - 9, py];
  const pockets = stroke(polyline(a, b)) + stroke(polyline(mirrorPt(a), mirrorPt(b)));
  return withPanels(piece({
    base: [fill(j.outline)],
    lines: [
      lp.fills,
      wb.fills,
      ink(stroke(j.edge), j.armSeams, stroke(frontEdge), stroke(stormFlap), pockets),
      ...buttons,
      wb.lines,
      lp.lines,
    ],
    clip: j.outline,
    stripe: "v",
  }), j.panels());
}

export const TRENCH_COAT: Record<string, KitPiece> = fitTable("trench-coat", FITS, "regular", trenchCoat);
