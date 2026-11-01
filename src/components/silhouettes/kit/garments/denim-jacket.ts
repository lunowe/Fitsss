/**
 * Denim jacket: the trucker. Point collar, button front, two pointed chest
 * flaps on a yoke, the V panel seams running down to a buttoned waistband,
 * buttoned cuffs.
 */
import { button, CX, fill, ink, L, mirrored, path, piece, polyline, seam, stroke } from "../draw";
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
  // Placket and buttons down the center front.
  const placketTop = neckY + 14;
  const placket = (x: number) => polyline([x, placketTop + 2], [x, bandTop - 0.5]);
  const buttons: string[] = [];
  for (let y = placketTop + 10; y < bandTop - 6; y += 21) buttons.push(button(CX, y, 1.9));
  buttons.push(button(CX, hemY - BAND / 2, 1.9));
  // Chest yoke and the pointed flap pockets hanging from it.
  const yokeY = j.armpit[1] - 2;
  const px = CX + 9;
  const pw = Math.round(dims.chestW * 0.36);
  const pocketFlap = flap(px, yokeY, pw, 8, 3.5);
  const pocketFlapL = flap(2 * CX - px - pw, yokeY, pw, 8, 3.5);
  const pocketBottom = yokeY + 22;
  const pocket = path([px + 0.5, yokeY + 6], [L([px + 0.5, pocketBottom]), L([px + pw - 0.5, pocketBottom]), L([px + pw - 0.5, yokeY + 6])]);
  const yoke = polyline([CX + 4.5, yokeY], [j.armpit[0] - 1, yokeY]);
  // Panel seams: from the pocket corners down to the waistband, closing in a little.
  const panel = (x0: number, x1: number) => polyline([x0, pocketBottom], [x1, bandTop]);
  const panelOuter = panel(px + pw, px + pw - 4);
  const panelInner = panel(px, px + 1);
  // Waistband with its side adjuster tabs.
  const bandLine = j.hemLine(BAND, 1);
  const tab = path([CX + dims.hemW - 16, bandTop + 2], [L([CX + dims.hemW - 6, bandTop + 2]), L([CX + dims.hemW - 6, hemY - 2]), L([CX + dims.hemW - 16, hemY - 2])], true);
  // Cuffs: a band with a button at the outer edge.
  const cuffDepth = 11;
  const cuffMid = [
    j.cuffOuter[0] + (j.cuffInner[0] - j.cuffOuter[0]) * 0.3 - j.sleeveDir[0] * (cuffDepth / 2),
    j.cuffOuter[1] + (j.cuffInner[1] - j.cuffOuter[1]) * 0.3 - j.sleeveDir[1] * (cuffDepth / 2),
  ] as const;
  return piece({
    base: [fill(j.outline)],
    lines: [
      collar.fills,
      pocketFlap.fill,
      pocketFlapL.fill,
      ink(
        stroke(j.edge),
        j.armSeams,
        j.cuffLines(cuffDepth),
        seam(bandLine),
        seam(placket(CX - 4)),
        seam(placket(CX + 4)),
        seam(yoke),
        seam(mirrored(yoke)),
        seam(pocket),
        seam(mirrored(pocket)),
        seam(panelOuter),
        seam(mirrored(panelOuter)),
        seam(panelInner),
        seam(mirrored(panelInner)),
        seam(tab),
        seam(mirrored(tab)),
        pocketFlap.lines,
        pocketFlapL.lines,
      ),
      ...buttons,
      button(px + pw / 2, yokeY + 11, 1.5),
      button(2 * CX - px - pw / 2, yokeY + 11, 1.5),
      button(CX + dims.hemW - 11, hemY - BAND / 2, 1.5),
      button(CX - dims.hemW + 11, hemY - BAND / 2, 1.5),
      button(cuffMid[0], cuffMid[1], 1.5),
      button(2 * CX - cuffMid[0], cuffMid[1], 1.5),
      collar.lines,
    ],
    clip: j.outline,
    stripe: "v",
  });
}

export const DENIM_JACKET: Record<string, KitPiece> = fitTable("denim-jacket", FITS, "regular", denimJacket);
