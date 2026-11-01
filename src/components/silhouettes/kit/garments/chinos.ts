/**
 * Chinos: a flat-front cotton trouser. Waistband with belt loops and a
 * button, a straight fly stitch, slant pockets, a clean tapered leg with a
 * plain hem.
 */
import { button, CX, fill, ink, piece, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { legs, type LegsSpec } from "../legs";
import { beltLoops, fly, loopXs, PANT_BASE, PANT_FITS, slantPockets } from "../parts-bottoms";
import { fitTable } from "../parts-outer";

function chinos(fit: string): KitPiece {
  const spec: LegsSpec = { ...PANT_BASE, ...PANT_FITS[fit] };
  // Chinos taper a touch more than jeans.
  spec.hemW = Math.max(16, spec.hemW - 1);
  const l = legs(spec);
  const { waistY } = spec;
  const band = spec.band ?? 9;
  return piece({
    base: [fill(l.outline)],
    lines: [
      beltLoops(l, loopXs(l)),
      ink(stroke(l.outline), seam(l.bandLine), fly(l), slantPockets(l, 11, 30), l.hemLines(3)),
      button(CX, waistY + band / 2, 2),
    ],
    clip: l.outline,
    stripe: "v",
  });
}

export const CHINOS: Record<string, KitPiece> = fitTable("chinos", Object.keys(PANT_FITS), "straight", chinos);
