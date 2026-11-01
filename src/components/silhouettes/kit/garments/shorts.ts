/**
 * Shorts: chino shorts above the knee. Waistband with loops and a button,
 * a straight fly, slant pockets and a stitched hem.
 */
import { button, CX, fill, ink, piece, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { legs, type LegsSpec } from "../legs";
import { beltLoops, fly, loopXs, SHORT_BASE, SHORT_FITS, slantPockets } from "../parts-bottoms";
import { fitTable } from "../parts-outer";

function shorts(fit: string): KitPiece {
  const spec: LegsSpec = { ...SHORT_BASE, ...SHORT_FITS[fit] };
  const l = legs(spec);
  const { waistY } = spec;
  const band = spec.band ?? 9;
  return piece({
    base: [fill(l.outline)],
    lines: [
      beltLoops(l, loopXs(l)),
      ink(stroke(l.outline), seam(l.bandLine), fly(l), slantPockets(l, 12, 20), l.hemLines(3.5)),
      button(CX, waistY + band / 2, 2),
    ],
    clip: l.outline,
    stripe: "v",
  });
}

export const SHORTS: Record<string, KitPiece> = fitTable("shorts", Object.keys(SHORT_FITS), "regular", shorts);
