/**
 * Jeans: five-pocket denim. Waistband with belt loops and a button, a fly
 * with its J-stitch, curved front pockets with a coin pocket, topstitched hems.
 */
import { button, C, CX, fill, framedByType, ink, mirrored, path, piece, polyline, Q, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { frontPocket, legs, type LegsSpec } from "../legs";
import { PANT_BASE, PANT_FITS } from "../parts-bottoms";
import { fitTable } from "../parts-outer";

function jeans(fit: string): KitPiece {
  const spec: LegsSpec = { ...PANT_BASE, ...PANT_FITS[fit] };
  const l = legs(spec);
  const { waistY, waistW } = spec;
  const band = spec.band ?? 9;
  const bandBottom = waistY + band;
  // Belt loops: two each side.
  const loop = (x: number) => path([x - 1.8, waistY + 1], [["L", [x - 1.8, bandBottom - 1]], ["L", [x + 1.8, bandBottom - 1]], ["L", [x + 1.8, waistY + 1]]], true);
  const loops = [CX - waistW + 7, CX - 13, CX + 13, CX + waistW - 7].map((x) => fill(loop(x)) + ink(seam(loop(x)))).join("");
  // Fly: the J-stitch on the wearer's left of center.
  const fly = path([CX + 6, bandBottom + 0.5], [C([CX + 6, l.crotchY - 20], [CX + 5, l.crotchY - 10], [CX + 0.5, l.crotchY - 3])]);
  const centerSeam = polyline([CX, bandBottom], [CX, l.crotchY]);
  // Pockets and the coin pocket inside the right one.
  const pocket = frontPocket(l, 15, 24);
  const coin = path([CX + waistW - 10, bandBottom], [Q([CX + waistW - 9, bandBottom + 9], [CX + waistW - 1.5, bandBottom + 10])]);
  return piece({
    base: [fill(l.outline)],
    lines: [
      loops,
      ink(
        stroke(l.outline),
        seam(l.bandLine),
        seam(centerSeam),
        seam(fly),
        seam(pocket),
        seam(mirrored(pocket)),
        seam(coin),
        l.hemLines(4),
      ),
      button(CX, waistY + band / 2, 2.2),
    ],
    clip: l.outline,
    stripe: "v",
  });
}

export const JEANS: Record<string, KitPiece> = framedByType(fitTable("jeans", Object.keys(PANT_FITS), "straight", jeans));
