/**
 * Trousers: tailored. A clean waistband with an extended tab closure and belt
 * loops, slant pockets, a pressed crease down each leg, plain hems with a
 * slight break on the shoe. No topstitching anywhere: the crease is the piece.
 */
import { CX, fill, ink, L, path, piece, polyline, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { legs, type LegsSpec } from "../legs";
import { beltLoops, fly, loopXs, PANT_BASE, PANT_FITS, slantPockets } from "../parts-bottoms";
import { fitTable } from "../parts-outer";

function trousers(fit: string): KitPiece {
  const spec: LegsSpec = { ...PANT_BASE, ...PANT_FITS[fit] };
  // A tailored leg breaks once on the shoe; baggy keeps its own pooling.
  spec.pool = spec.pool ?? 1.6;
  const l = legs(spec);
  const { waistY, length } = spec;
  const band = spec.band ?? 9;
  const gap = spec.gap ?? 6;
  // Extended waistband tab across the center, with its hook.
  const tab = path([CX - 1, waistY + 1], [L([CX + 9, waistY + 1]), L([CX + 9, waistY + band - 1]), L([CX - 1, waistY + band - 1])]);
  // Crease: down the middle of each leg from below the pocket to the hem,
  // a shade darker than a seam so it reads as a pressed fold.
  const creaseTop = l.crotchY - 2;
  const midX = (y: number) => (CX + gap / 2 + l.outerX(y)) / 2;
  const crease = path([midX(creaseTop) + 1, creaseTop], [L([midX(l.kneeY), l.kneeY]), L([midX(length - 1), length - 1])]);
  const creaseL = path([2 * CX - midX(creaseTop) - 1, creaseTop], [L([2 * CX - midX(l.kneeY), l.kneeY]), L([2 * CX - midX(length - 1), length - 1])]);
  return piece({
    base: [fill(l.outline)],
    lines: [
      beltLoops(l, loopXs(l)),
      ink(
        stroke(l.outline),
        seam(l.bandLine),
        fly(l),
        stroke(tab),
        seam(polyline([CX + 6, waistY + 3], [CX + 6, waistY + band - 3])),
        slantPockets(l, 10, 30),
        stroke(crease, 0.7),
        stroke(creaseL, 0.7),
        l.breakLines(),
      ),
    ],
    clip: l.outline,
    stripe: "v",
  });
}

export const TROUSERS: Record<string, KitPiece> = fitTable("trousers", Object.keys(PANT_FITS), "straight", trousers);
