/**
 * Bomber: the MA-1. A short, bloused body that bellies out and gathers into
 * a deep rib hem band, a rib collar and rib cuffs (the knit drawn as lines,
 * so they read in the second color and in black alike), full sleeves, a full
 * zip and two slanted welt pockets. Nothing else: the blouson is the identity.
 */
import { CX, FILL2, fill, ink, mirrored, piece, seam, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { fitTable, gathers, jacket, JACKET_BASE, type JacketSpec, mirrorPt, outerFit, ribCuffs, ribHem, roundNeck, standCollar, weltPocket, withPanels, zip } from "../parts-outer";

const BASE = { ...JACKET_BASE, length: 158, chestW: 60, hemW: 48, cuffW: 21, armhole: 36, sleeveLen: 116 };
const FITS = ["fitted", "regular", "relaxed", "oversized"];
const RIB = 12;
const CUFF = 10;

function bomber(fit: string): KitPiece {
  const dims = outerFit(BASE, fit);
  // Blouson: the body swells below the chest and is gathered onto a rib band
  // a good deal narrower than it.
  dims.waistW = dims.chestW + 3;
  dims.hemW = dims.chestW - 12;
  const { neckW, neckY } = dims;
  const spec: JacketSpec = { ...dims, neck: roundNeck(neckW, neckY, 6), blouson: RIB, sleeveBow: 4 };
  const j = jacket(spec);
  const collar = standCollar(neckW, neckY, 8, { paint: FILL2, rib: true });
  const z = zip(CX, collar.holeY, j.hemY - 1);
  // Welt pockets, slanted in towards the center.
  const py = j.bodyY(0.5);
  const pA: Pt = [CX + 12, py];
  const pB: Pt = [CX + dims.chestW - 10, py + 14];
  const pockets = weltPocket(pA, pB) + weltPocket(mirrorPt(pA), mirrorPt(pB));
  return withPanels(piece({
    base: [fill(j.outline)],
    lines: [
      collar.fills,
      fill(j.hemBand(RIB), FILL2),
      fill(j.cuffBand(CUFF), FILL2),
      fill(mirrored(j.cuffBand(CUFF)), FILL2),
      ink(stroke(j.edge), j.armSeams, j.cuffLines(CUFF), seam(j.hemLine(RIB, 1)), ribHem(j, RIB), ribCuffs(j, CUFF), gathers(j, RIB), z.strokes, pockets),
      collar.lines,
      z.slider,
    ],
    clip: j.outline,
    stripe: "h",
    block: j.sleevePanel() + mirrored(j.sleevePanel()),
  }), j.panels());
}

export const BOMBER: Record<string, KitPiece> = fitTable("bomber", FITS, "regular", bomber);
