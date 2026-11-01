/**
 * Cargo pants: a relaxed work trouser with a big bellows pocket on each
 * thigh, a flap on top with a single button. The pockets are the piece, so
 * they are large enough to read at closet size and the rest stays plain.
 * Fits from slim to wide, no skinny; every fit cuts a little fuller than the
 * shared table.
 */
import { button, CX, fill, ink, L, mirrored, path, piece, seam, stroke } from "../draw";
import type { KitPiece } from "../types";
import { legs, type LegsSpec } from "../legs";
import { beltLoops, fly, loopXs, PANT_BASE, PANT_FITS, slantPockets } from "../parts-bottoms";
import { fitTable, flap } from "../parts-outer";

const FITS = ["slim", "straight", "relaxed", "baggy", "wide"];

function cargoPants(fit: string): KitPiece {
  const spec: LegsSpec = { ...PANT_BASE, ...PANT_FITS[fit] };
  spec.hipW += 1;
  spec.kneeW += 3;
  spec.hemW += 2;
  const l = legs(spec);
  const { waistY } = spec;
  const band = spec.band ?? 9;
  // Bellows pocket on the thigh: a tall bag with a deep flap, set towards the
  // outseam. Width follows the leg so it never crowds the inseam.
  const ph = 30;
  const py = l.kneeY - ph - 12;
  const pw = Math.min(26, Math.round(spec.kneeW * 0.72));
  const px = l.outerX(py + ph / 2) - pw - 3.5;
  const bag = path([px, py + 7], [L([px, py + ph - 2]), L([px + 2, py + ph]), L([px + pw - 2, py + ph]), L([px + pw, py + ph - 2]), L([px + pw, py + 7])]);
  // The bellows: a fold line inside each side of the bag.
  const bellows = path([px + 2.5, py + 8], [L([px + 2.5, py + ph - 1])]);
  const bellowsR = path([px + pw - 2.5, py + 8], [L([px + pw - 2.5, py + ph - 1])]);
  const f = flap(px - 0.5, py, pw + 1, 8);
  const fL = flap(2 * CX - px - pw - 0.5, py, pw + 1, 8);
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
        stroke(bag),
        stroke(mirrored(bag)),
        seam(bellows),
        seam(bellowsR),
        seam(mirrored(bellows)),
        seam(mirrored(bellowsR)),
        f.lines,
        fL.lines,
        l.hemLines(3),
      ),
      button(CX, waistY + band / 2, 2),
      button(px + pw / 2, py + 4.5, 1.4),
      button(2 * CX - px - pw / 2, py + 4.5, 1.4),
    ],
    clip: l.outline,
    stripe: "v",
  });
}

export const CARGO_PANTS: Record<string, KitPiece> = fitTable("cargo-pants", FITS, "straight", cargoPants);
