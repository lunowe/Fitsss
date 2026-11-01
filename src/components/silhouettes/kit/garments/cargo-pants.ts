/**
 * Cargo pants: chinos with a bellows pocket on each thigh, flap on top and a
 * box pleat down its middle. Fits from slim to wide, no skinny.
 */
import { button, CX, fill, ink, L, mirrored, path, piece, polyline, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { legs, type LegsSpec } from "../legs";
import { beltLoops, fly, loopXs, PANT_BASE, PANT_FITS, slantPockets } from "../parts-bottoms";
import { fitTable, flap } from "../parts-outer";

const FITS = ["slim", "straight", "relaxed", "baggy", "wide"];

function cargoPants(fit: string): KitPiece {
  const spec: LegsSpec = { ...PANT_BASE, ...PANT_FITS[fit] };
  const l = legs(spec);
  const { waistY } = spec;
  const band = spec.band ?? 9;
  // Cargo pocket on the outer thigh, above the knee.
  const py = l.kneeY - 34;
  const ph = 24;
  const pw = Math.min(20, Math.round(spec.kneeW * 0.58));
  const px = l.outerX(py + ph / 2) - pw - 3;
  const bag = path([px, py + 5], [L([px, py + ph]), L([px + pw, py + ph]), L([px + pw, py + 5])]);
  const pleat = polyline([px + pw / 2, py + 6], [px + pw / 2, py + ph - 0.5]);
  const f = flap(px, py, pw, 6);
  const fL = flap(2 * CX - px - pw, py, pw, 6);
  return piece({
    base: [fill(l.outline)],
    lines: [
      beltLoops(l, loopXs(l)),
      f.fill,
      fL.fill,
      ink(
        stroke(l.outline),
        seam(l.bandLine),
        fly(l),
        slantPockets(l, 11, 30),
        seam(bag),
        seam(mirrored(bag)),
        seam(pleat),
        seam(mirrored(pleat)),
        f.lines,
        fL.lines,
        l.hemLines(3),
      ),
      button(CX, waistY + band / 2, 2),
      button(px + pw / 2, py + 3.5, 1.3),
      button(2 * CX - px - pw / 2, py + 3.5, 1.3),
    ],
    clip: l.outline,
    stripe: "v",
  });
}

export const CARGO_PANTS: Record<string, KitPiece> = fitTable("cargo-pants", FITS, "straight", cargoPants);
