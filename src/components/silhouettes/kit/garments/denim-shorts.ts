/**
 * Denim shorts: jeans cut above the knee, with the five-pocket details (belt
 * loops, J-stitch fly, curved pockets and coin pocket) and turned-up cuffs.
 */
import { button, CX, fill, ink, mirrored, path, piece, Q, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { frontPocket, legs, type LegsSpec } from "../legs";
import { beltLoops, fly, loopXs, SHORT_BASE, SHORT_FITS, turnUps } from "../parts-bottoms";
import { fitTable } from "../parts-outer";

function denimShorts(fit: string): KitPiece {
  const spec: LegsSpec = { ...SHORT_BASE, ...SHORT_FITS[fit] };
  const l = legs(spec);
  const { waistY, waistW } = spec;
  const band = spec.band ?? 9;
  const bandBottom = waistY + band;
  const pocket = frontPocket(l, 15, 20);
  const coin = path([CX + waistW - 10, bandBottom], [Q([CX + waistW - 9, bandBottom + 9], [CX + waistW - 1.5, bandBottom + 10])]);
  const cuffs = turnUps(l, 9);
  return piece({
    base: [fill(l.outline)],
    lines: [
      beltLoops(l, loopXs(l)),
      cuffs.fills,
      ink(stroke(l.outline), seam(l.bandLine), fly(l, true), seam(pocket), seam(mirrored(pocket)), seam(coin), cuffs.lines),
      button(CX, waistY + band / 2, 2.2),
    ],
    clip: l.outline,
    stripe: "v",
  });
}

export const DENIM_SHORTS: Record<string, KitPiece> = fitTable("denim-shorts", Object.keys(SHORT_FITS), "regular", denimShorts);
