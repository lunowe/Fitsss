/**
 * Denim jacket: the trucker. Point collar, button front, two pointed chest
 * flaps and the two seams that run from them down to the waistband. That is
 * the whole trucker: everything else stays plain denim.
 */
import { button, CX, fill, ink, L, mirrored, piece, polyline, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { pointCollar } from "./shirt";
import { fitTable, flap, jacket, JACKET_BASE, outerFit, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 158, hemW: 53, chestW: 57 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const BAND = 10;

function denimJacket(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  const { neckW, neckY } = dims;
  // Under the collar the neckline is a V to the top button.
  const spec: JacketSpec = { ...dims, neck: { start: [CX, neckY + 14], segs: [L([CX + neckW, neckY])] } };
  const j = jacket(spec);
  const collar = pointCollar(neckW, neckY);
  const hemY = j.hemY;
  const bandTop = hemY - BAND;
  // The overlapping front's edge and the buttons down the center.
  const frontEdge = polyline([CX - 3.5, neckY + 16], [CX - 3.5, bandTop - 0.5]);
  const buttons: string[] = [];
  for (let y = neckY + 26; y < bandTop - 8; y += 22) buttons.push(button(CX, y, 1.9));
  buttons.push(button(CX, hemY - BAND / 2, 1.9));
  // Pointed chest flaps, and the panel seams running from their outer corners
  // down to the waistband, closing in a little.
  const flapY = j.armpit[1] - 3;
  const px = CX + 9;
  const pw = Math.round(dims.chestW * 0.36);
  const pocketFlap = flap(px, flapY, pw, 8, 3.5);
  const pocketFlapL = flap(2 * CX - px - pw, flapY, pw, 8, 3.5);
  const panel = polyline([px + pw, flapY + 8], [px + pw - 4, bandTop]);
  const bandLine = j.hemLine(BAND, 1);
  return piece({
    base: [fill(j.outline)],
    lines: [
      collar.fills,
      pocketFlap.fill,
      pocketFlapL.fill,
      ink(
        stroke(j.edge),
        j.armSeams,
        j.cuffLines(10),
        seam(bandLine),
        stroke(frontEdge),
        seam(panel),
        seam(mirrored(panel)),
        pocketFlap.lines,
        pocketFlapL.lines,
      ),
      ...buttons,
      button(px + pw / 2, flapY + 4, 1.4),
      button(2 * CX - px - pw / 2, flapY + 4, 1.4),
      collar.lines,
    ],
    clip: j.outline,
    stripe: "v",
  });
}

export const DENIM_JACKET: Record<string, KitPiece> = fitTable("denim-jacket", FITS, "regular", denimJacket);
