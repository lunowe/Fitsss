/**
 * Beanies, front view: a knit dome with its cuff. The cuffed beanie folds a
 * deep cuff, the fisherman sits short and wide with a thick roll, the
 * slouchy is tall and falls over to one side. Stripes run across; the logo
 * sits on the cuff.
 */
import { C, CX, fill, ink, L, path, piece, polyline, Q, shade, stroke, symmetric, type Pt } from "../draw";
import type { KitPiece } from "../types";

const BOTTOM = 160;
/** Rib lines are quieter than seams so a stripe or logo stays on top. */
const RIB = 0.32;

interface BeanieSpec {
  /** Half width at the cuff. */
  w: number;
  /** y of the crown's top. */
  top: number;
  /** Depth of the cuff. */
  cuff: number;
  /** Half width of the crown at its widest, above the cuff. */
  bulge: number;
  /** Rib lines on the crown (count). */
  ribs: number;
  /** The slouch: how far the crown's top leans right, 0 for upright. */
  lean?: number;
}

function beanie(spec: BeanieSpec): KitPiece {
  const { w, top, cuff, bulge, ribs } = spec;
  const lean = spec.lean ?? 0;
  const cuffTop = BOTTOM - cuff;
  const bodyH = cuffTop - top;
  let outline: string;
  if (!lean) {
    outline = symmetric([CX, top], [
      C([CX + bulge * 0.55, top], [CX + bulge, top + bodyH * 0.32], [CX + bulge, top + bodyH * 0.6]),
      C([CX + bulge, top + bodyH * 0.85], [CX + w + 2, cuffTop - 2], [CX + w + 2, cuffTop]),
      L([CX + w, BOTTOM]),
      L([CX, BOTTOM]),
    ]);
  } else {
    // A slouch: the crown rises, then folds over to the right and droops.
    const fold: Pt = [CX + lean, top + 4];
    outline = path([CX - w, BOTTOM], [
      L([CX - w - 2, cuffTop]),
      C([CX - w - 2, cuffTop - bodyH * 0.35], [CX - bulge * 0.9, top + bodyH * 0.18], [CX - 10, top + 2]),
      C([CX + 8, top - 3], [CX + lean - 12, top - 4], fold),
      C([CX + lean + 14, top + 10], [CX + lean + 10, top + 30], [CX + lean - 2, top + 36]),
      C([CX + bulge - 4, top + bodyH * 0.5], [CX + w + 2, cuffTop - 6], [CX + w + 2, cuffTop]),
      L([CX + w, BOTTOM]),
    ], true);
  }
  const cuffLine = polyline([CX - w - 2, cuffTop], [CX + w + 2, cuffTop]);
  // The cuff's fold: a shade along its top edge, and a stitch across.
  const foldShade = path([CX - w - 2, cuffTop], [L([CX + w + 2, cuffTop]), L([CX + w + 1.6, cuffTop + 4]), L([CX - w - 1.6, cuffTop + 4])], true);
  const ribLines: string[] = [];
  for (let i = 1; i <= ribs; i++) {
    const t = i / (ribs + 1);
    const x = CX - bulge + 2 * bulge * t;
    const topY = top + (lean ? 8 : 4) + Math.abs(t - 0.5) * 2 * (lean ? 10 : 14);
    ribLines.push(stroke(path([x, cuffTop - 1.5], [Q([x + (x - CX) * 0.08, top + bodyH * 0.5], [CX + (x - CX) * 0.75, topY])]), RIB));
  }
  const cuffRibs: string[] = [];
  const count = Math.round(w / 6);
  for (let i = -count; i <= count; i++) {
    const x = CX + (i * w) / count;
    if (Math.abs(i) === count) continue;
    cuffRibs.push(stroke(polyline([x, cuffTop + 5], [x, BOTTOM - 1.5]), RIB));
  }
  return piece({
    base: [fill(outline)],
    lines: [shade(foldShade, 0.12), ink(stroke(outline), stroke(cuffLine), ...ribLines, ...cuffRibs)],
    clip: outline,
    stripe: "h",
    logo: [CX, cuffTop + cuff / 2 + 0.5, Math.min(cuff - 5, 16)],
  });
}

export const BEANIE: Record<string, KitPiece> = {
  "beanie~cuffed": beanie({ w: 50, top: 30, cuff: 26, bulge: 54, ribs: 7 }),
  "beanie~fisherman": beanie({ w: 54, top: 74, cuff: 30, bulge: 58, ribs: 7 }),
  "beanie~slouchy": beanie({ w: 46, top: 14, cuff: 14, bulge: 52, ribs: 5, lean: 34 }),
};
BEANIE["beanie"] = BEANIE["beanie~cuffed"];
