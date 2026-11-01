/**
 * Jeans: five-pocket denim. Waistband with belt loops and a button, a fly
 * with its J-stitch, curved front pockets stitched twice with a coin pocket
 * and rivets, a felled inseam and topstitched hems: the denim identity is the
 * stitching, so it is drawn where a pair of trousers stays plain.
 */
import { button, C, CX, fill, framedByType, ink, mirrored, path, piece, polyline, Q, seam, stroke } from "../draw";

/** Denim topstitching is a contrast thread: a shade heavier than a plain seam. */
const STITCH = 0.72;
const stitch = (d: string) => stroke(d, STITCH);
import type { KitPiece } from "../types";
import { frontPocket, legs, type LegsSpec } from "../legs";
import { PANT_BASE, PANT_FITS } from "../parts-bottoms";
import { buttonAt, fitTable } from "../parts-outer";

function jeans(fit: string): KitPiece {
  const spec: LegsSpec = { ...PANT_BASE, ...PANT_FITS[fit] };
  const l = legs(spec);
  const { waistY, waistW } = spec;
  const band = spec.band ?? 9;
  const bandBottom = waistY + band;
  // Belt loops: two each side.
  const loop = (x: number) => path([x - 1.8, waistY + 1], [["L", [x - 1.8, bandBottom - 1]], ["L", [x + 1.8, bandBottom - 1]], ["L", [x + 1.8, waistY + 1]]], true);
  const loops = [CX - waistW + 7, CX - 13, CX + 13, CX + waistW - 7].map((x) => fill(loop(x)) + ink(seam(loop(x)))).join("");
  // Fly: the J-stitch on the wearer's left of center, stitched twice.
  const fly = (dx: number) => path([CX + 6 + dx, bandBottom + 0.5], [C([CX + 6 + dx, l.crotchY - 20], [CX + 5 + dx, l.crotchY - 10 + dx], [CX + 0.5, l.crotchY - 3 + dx * 1.5])]);
  const centerSeam = polyline([CX, bandBottom], [CX, l.crotchY]);
  // Pockets: the curved opening, its second row of stitching, the coin pocket
  // inside the right one, and a rivet at each end of the opening.
  const pocket = frontPocket(l, 15, 24);
  const pocket2 = frontPocket(l, 13.5, 26.5);
  const coin = path([CX + waistW - 9, bandBottom + 0.5], [Q([CX + waistW - 8, bandBottom + 11], [CX + waistW - 0.5, bandBottom + 12])]);
  const rivetTop: [number, number] = [CX + waistW - 15, bandBottom + 1.5];
  const rivetSide: [number, number] = [l.outerX(bandBottom + 24) - 2.5, bandBottom + 23];
  const rivets = [rivetTop, rivetSide].flatMap(([x, y]) => [buttonAt(x, y, 1.1), buttonAt(2 * CX - x, y, 1.1)]).join("");
  return piece({
    base: [fill(l.outline)],
    lines: [
      loops,
      ink(
        stroke(l.outline),
        seam(l.bandLine),
        seam(centerSeam),
        stitch(fly(0)),
        stitch(fly(2)),
        stitch(pocket),
        stitch(mirrored(pocket)),
        stitch(pocket2),
        stitch(mirrored(pocket2)),
        stitch(coin),
        l.inseamLines(2.2),
        l.hemLines(4),
      ),
      rivets,
      button(CX, waistY + band / 2, 2.2),
    ],
    clip: l.outline,
    stripe: "v",
  });
}

export const JEANS: Record<string, KitPiece> = framedByType(fitTable("jeans", Object.keys(PANT_FITS), "straight", jeans));
