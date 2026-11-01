/**
 * Trousers: tailored. A higher rise than denim, a clean waistband with an
 * extended tab closure and belt loops, slant pockets, a pressed crease down
 * each leg, plain hems with a slight break on the shoe. The fuller cuts
 * (relaxed, baggy, wide) are pleated: the crease runs up into a front pleat
 * at the waistband with a second pleat beside it. No topstitching anywhere:
 * the crease is the piece.
 */
import { CX, fill, ink, L, path, piece, polyline, Q, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { legs, type LegsSpec } from "../legs";
import { beltLoops, fly, loopXs, PANT_BASE, PANT_FITS, slantPockets } from "../parts-bottoms";
import { fitTable } from "../parts-outer";

const PLEATED = new Set(["relaxed", "baggy", "wide"]);

function trousers(fit: string): KitPiece {
  const spec: LegsSpec = { ...PANT_BASE, ...PANT_FITS[fit] };
  // Tailored: the waist sits higher (a shorter rise to the same crotch) and
  // the leg breaks once on the shoe; baggy keeps its own pooling.
  spec.waistY = PANT_BASE.waistY - 4;
  spec.rise = (spec.rise ?? PANT_BASE.rise) + 4;
  spec.pool = spec.pool ?? 1.6;
  // A tailored leg never goes as tight as skinny denim: a cigarette leg.
  if (fit === "skinny") Object.assign(spec, { kneeW: 19, hemW: 14, gap: 5, taper: 0.8 });
  const l = legs(spec);
  const { waistY, length } = spec;
  const band = spec.band ?? 9;
  const gap = spec.gap ?? 6;
  const bandBottom = waistY + band;
  // Extended waistband tab across the center, with its hook.
  const tab = path([CX - 1, waistY + 1], [L([CX + 9, waistY + 1]), L([CX + 9, waistY + band - 1]), L([CX - 1, waistY + band - 1])]);
  // Crease: down the middle of each leg to the hem, a shade darker than a
  // seam so it reads as a pressed fold. Flat fronts start it below the
  // pocket; pleated fronts run it up into the pleat at the waistband.
  const pleated = PLEATED.has(fit);
  const midX = (y: number) => (CX + gap / 2 + l.outerX(y)) / 2;
  const creaseTop = pleated ? bandBottom + 0.5 : l.crotchY - 2;
  const creaseX0 = pleated ? CX + (spec.waistW ?? PANT_BASE.waistW) * 0.42 : midX(creaseTop) + 1;
  const crease = (k: number) =>
    path([CX + (creaseX0 - CX) * k, creaseTop], [
      pleated ? Q([CX + (midX(l.crotchY) - CX) * k, l.crotchY - 6], [CX + (midX(l.kneeY) - CX) * k, l.kneeY]) : L([CX + (midX(l.kneeY) - CX) * k, l.kneeY]),
      L([CX + (midX(length - 1) - CX) * k, length - 1]),
    ]);
  // Second pleat: a shorter fold beside the crease, fading out at the hip.
  const pleatLen = (l.crotchY - bandBottom) * 0.55;
  const pleat = (k: number) => path([CX + (creaseX0 + 7 - CX) * k, bandBottom + 0.5], [Q([CX + (creaseX0 + 7.5 - CX) * k, bandBottom + pleatLen * 0.5], [CX + (creaseX0 + 5 - CX) * k, bandBottom + pleatLen])]);
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
        stroke(crease(1), 0.7),
        stroke(crease(-1), 0.7),
        pleated ? seam(pleat(1)) + seam(pleat(-1)) : "",
        l.breakLines(),
      ),
    ],
    clip: l.outline,
    stripe: "v",
  });
}

export const TROUSERS: Record<string, KitPiece> = fitTable("trousers", Object.keys(PANT_FITS), "straight", trousers);
