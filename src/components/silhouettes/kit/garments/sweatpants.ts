/**
 * Sweatpants: an elastic drawstring waistband and rib cuffs in the second
 * color, side-seam pockets, no fly. Wide-leg sweats have an open hem.
 */
import { CX, fill, ink, mirrored, piece, polyline, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { legs, type LegsSpec } from "../legs";
import { drawstring, elasticBand, PANT_BASE, PANT_FITS, ribCuffs } from "../parts-bottoms";
import { fitTable } from "../parts-outer";

const FITS = ["slim", "straight", "relaxed", "baggy", "wide"];
const BAND = 12;
const CUFF = 11;

function sweatpants(fit: string): KitPiece {
  const spec: LegsSpec = { ...PANT_BASE, ...PANT_FITS[fit], band: BAND, waistW: 36 };
  // Cuffed hems gather the leg: a narrower hem than the knee, and no pooling over a rib.
  if (fit !== "wide") spec.hemW = Math.round(Math.min(spec.hemW, spec.kneeW * 0.8));
  spec.pool = 0;
  const l = legs(spec);
  const { waistY } = spec;
  const band = elasticBand(l, BAND);
  const cuffs = fit === "wide" ? undefined : ribCuffs(l, CUFF);
  // Side-seam pockets: a vertical opening just inside the outseam.
  const pocketTop = waistY + BAND + 8;
  const pocket = polyline([l.outerX(pocketTop) - 3, pocketTop], [l.outerX(pocketTop + 26) - 3, pocketTop + 26]);
  const center = polyline([CX, waistY + BAND], [CX, l.crotchY]);
  return piece({
    base: [fill(l.outline)],
    lines: [
      band.fills,
      cuffs?.fills ?? "",
      ink(
        stroke(l.outline),
        band.lines,
        seam(center),
        stroke(pocket),
        stroke(mirrored(pocket)),
        cuffs ? cuffs.lines : l.hemLines(4),
        drawstring(l, BAND),
      ),
    ],
    clip: l.outline,
    stripe: "v",
    logo: [CX + 17, l.crotchY - 14, 11],
  });
}

export const SWEATPANTS: Record<string, KitPiece> = fitTable("sweatpants", FITS, "straight", sweatpants);
