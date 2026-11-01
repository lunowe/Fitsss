/**
 * Denim jacket: the trucker. A short boxy body ending in a deep waistband,
 * a wide button placket, a yoke seam across the chest with two big pointed
 * flap pockets hanging from it, and the panel seams that run from the flaps
 * down to the band. The edges of the placket, band and flaps are full ink,
 * the topstitched look of denim; everything else stays plain.
 */
import { button, CX, fill, ink, mirrored, piece, polyline, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { foldCollar, vNeckUnder } from "../parts-tops";
import { fitTable, flap, jacket, JACKET_BASE, outerFit, withPanels, type JacketSpec } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 150, hemW: 52, chestW: 57, shoulderW: 59, armhole: 32, sleeveLen: 116 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const BAND = 11;
const PLACKET = 4.5;

function denimJacket(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  // Boxy: the body falls straight into the band, no waist.
  dims.waistW = Math.min(dims.chestW, dims.hemW) + 1;
  const { neckW, neckY } = dims;
  const spec: JacketSpec = { ...dims, neck: vNeckUnder(neckW, neckY) };
  const j = jacket(spec);
  // A short, wide spread collar: shorter leaves than a shirt's.
  const collar = foldCollar(neckW, neckY, {
    back: neckW + 7,
    meet: [CX + 1.5, neckY + 11],
    point: [CX + 17, neckY + 22],
    bow: [CX + neckW + 9, neckY + 10],
    throat: neckY + 10,
  });
  const hemY = j.hemY;
  const bandTop = hemY - BAND;
  // Placket: a wide strip down the center front, buttons on its middle.
  const placketTop = neckY + 12;
  const placketEdge = (k: number) => polyline([CX + PLACKET * k, placketTop], [CX + PLACKET * k, bandTop]);
  const buttons: string[] = [];
  const n = 4;
  for (let i = 0; i < n; i++) buttons.push(button(CX, placketTop + 8 + ((bandTop - 6 - placketTop - 8) * i) / (n - 1), 1.9));
  buttons.push(button(CX, hemY - BAND / 2, 1.9));
  // Yoke seam across the chest at the armpit, from the placket to the armhole.
  const yokeY = j.armpit[1] - 2;
  const yoke = polyline([CX + PLACKET + 0.5, yokeY], [j.armpit[0] - 1, yokeY]);
  // Pointed flaps hanging from the yoke, and the panel seam from each flap's
  // outer corner down to the band, closing in a little.
  const pw = Math.round(dims.chestW * 0.46);
  const px = CX + PLACKET + 3;
  const flapR = flap(px, yokeY, pw, 10, 4.5);
  const flapL = flap(2 * CX - px - pw, yokeY, pw, 10, 4.5);
  const panel = polyline([px + pw - 0.5, yokeY + 10], [px + pw - 6, bandTop]);
  // Waistband: its top edge in full ink, side tabs buttoned at the hips.
  const bandLine = j.hemLine(BAND, 0.5);
  const tabX = CX + dims.hemW - 9;
  return withPanels(
    piece({
      base: [fill(j.outline)],
      lines: [
        collar.fills,
        flapR.fill,
        flapL.fill,
        ink(
          stroke(j.edge),
          j.armSeams,
          j.cuffLines(9),
          stroke(bandLine),
          stroke(placketEdge(1)),
          stroke(placketEdge(-1)),
          seam(yoke),
          seam(mirrored(yoke)),
          seam(panel),
          seam(mirrored(panel)),
          flapR.lines,
          flapL.lines,
        ),
        ...buttons,
        button(px + pw / 2, yokeY + 5.5, 1.4),
        button(2 * CX - px - pw / 2, yokeY + 5.5, 1.4),
        button(tabX, hemY - BAND / 2, 1.4),
        button(2 * CX - tabX, hemY - BAND / 2, 1.4),
        ink(collar.lines),
      ],
      clip: j.outline,
      stripe: "v",
    }),
    j.panels(),
  );
}

export const DENIM_JACKET: Record<string, KitPiece> = fitTable("denim-jacket", FITS, "regular", denimJacket);
