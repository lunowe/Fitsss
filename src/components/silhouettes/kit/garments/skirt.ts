/**
 * Skirt: an A-line skirt with a waistband and two front panel seams. The fit
 * is its length: mini, midi, maxi; the hem widens with it.
 */
import { C, CX, fill, ink, L, mirrored, path, piece, polyline, Q, seam, stroke, symmetric } from "../draw";
import type { KitPiece } from "../types";

const WAIST_Y = 12;
const WAIST_W = 33;
const BAND = 8;

const FITS: Record<string, { length: number; hemW: number }> = {
  mini: { length: 78, hemW: 50 },
  midi: { length: 140, hemW: 64 },
  maxi: { length: 192, hemW: 72 },
};

function skirt(fit: string): KitPiece {
  const { length, hemW } = FITS[fit];
  const hemY = WAIST_Y + length;
  const droop = 4 + (hemW - WAIST_W) * 0.08;
  const outline = symmetric([CX, WAIST_Y], [
    L([CX + WAIST_W, WAIST_Y]),
    // Side: eases out from the waist, then runs straight to the hem.
    C([CX + WAIST_W + 1, WAIST_Y + length * 0.18], [CX + WAIST_W + (hemW - WAIST_W) * 0.45, WAIST_Y + length * 0.55], [CX + hemW, hemY]),
    Q([CX + hemW * 0.5, hemY + droop], [CX, hemY + droop]),
  ]);
  const bandLine = polyline([CX - WAIST_W - 0.3, WAIST_Y + BAND], [CX + WAIST_W + 0.3, WAIST_Y + BAND]);
  const hemLine = path([CX - hemW + 2, hemY - 4], [Q([CX, hemY + droop - 4], [CX + hemW - 2, hemY - 4])]);
  // Panel seam: follows the flare of the skirt.
  const seamX0 = WAIST_W * 0.5;
  const seamX1 = hemW * 0.5;
  const panel = path([CX + seamX0, WAIST_Y + BAND + 0.5], [C([CX + seamX0 + 0.5, WAIST_Y + length * 0.3], [CX + seamX1 - 1, WAIST_Y + length * 0.7], [CX + seamX1, hemY + droop * 0.75 - 0.5])]);
  return piece({
    base: [fill(outline)],
    lines: [ink(stroke(outline), seam(bandLine), seam(panel), seam(mirrored(panel)), seam(hemLine))],
    clip: outline,
    stripe: "v",
  });
}

export const SKIRT: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`skirt@${fit}`, skirt(fit)]),
);
SKIRT["skirt"] = SKIRT["skirt@midi"];
