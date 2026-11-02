/**
 * Shirt: a casual button-up with a point collar, front placket, one chest
 * pocket, long sleeves with buttoned cuffs and a shirt-tail hem.
 */
import { button, C, CX, fill, framedByType, ink, L, mirrored, path, piece, polyline, Q, seam, shade, stroke, symmetric, type Pt } from "../draw";
import { topFit } from "../parts-tops";
import { fitTable, phaseBreak } from "../parts-outer";
import type { KitPiece } from "../types";
import { torso, type Neckline, type TorsoSpec } from "../torso";

const NECK_Y = 22;
const NECK_W = 15;

const BASE: Omit<TorsoSpec, "neck"> = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 58,
  shoulderDrop: 9,
  chestW: 54,
  hemW: 53,
  length: 170,
  hemCurve: 8,
  armhole: 32,
  sleeveLen: 114,
  cuffW: 22,
  sleeveW: 25,
  hang: 2.5,
  sleeveAngle: 75,
};

const FITS = ["fitted", "regular", "relaxed", "oversized", "boxy"];

/** Under a collar the body's neckline is a plain V; the collar covers it. */
const vNeck: Neckline = { start: [CX, NECK_Y + 14], segs: [L([CX + NECK_W, NECK_Y])] };

/**
 * A point collar with its stand, drawn around a neck of half width `w` on
 * the shoulder line `y`. Returns fills (collar back, stand interior, leaves)
 * and the ink.
 */
export function pointCollar(w: number, y: number): { fills: string; lines: string } {
  const back = w + 6; // half width of the collar at the fold, behind the neck
  const foldApex = y - 1;
  const throat = y + 12;
  const meet: Pt = [CX + 1.5, y + 13]; // where the leaves meet at center front
  const point: Pt = [CX + 10, y + 31];
  const foldEnd: Pt = [CX + back, y + 1];
  // Collar back: the outer face, folded over above the shoulder line.
  const collarBack = symmetric([CX, y - 7], [C([CX + back * 0.55, y - 7], [CX + back, y - 4], foldEnd), L([CX, foldApex])]);
  // Stand: the inside of the collar, seen at the throat.
  const stand = symmetric([CX, foldApex], [L(foldEnd), C([CX + back, y + 7], [CX + w * 0.6, throat], [CX, throat])]);
  // Leaf: hangs from the fold line to its point, meets its twin at center front.
  const outer = Q([CX + back + 1, y + 16], point);
  const leaf = path(foldEnd, [outer, L(meet), Q([CX + w * 0.75, foldApex + 3], foldEnd)], true);
  const leafEdge = path(foldEnd, [outer, L(meet)]);
  const foldLine = path([CX - back, y + 1], [Q([CX - w * 0.75, foldApex + 3], [CX - 1.5, y + 13]), L(meet), Q([CX + w * 0.75, foldApex + 3], foldEnd)]);
  return {
    fills: fill(collarBack) + fill(stand) + shade(stand, 0.2) + fill(leaf) + fill(mirrored(leaf)),
    lines: ink(
      stroke(path([CX - back, y + 1], [C([CX - back, y - 4], [CX - back * 0.55, y - 7], [CX, y - 7]), C([CX + back * 0.55, y - 7], [CX + back, y - 4], foldEnd)])),
      stroke(foldLine),
      stroke(leafEdge),
      stroke(mirrored(leafEdge)),
    ),
  };
}

function shirt(fit: string): KitPiece {
  const spec: TorsoSpec = { ...topFit(BASE, fit), neck: vNeck };
  const t = torso(spec);
  const collar = pointCollar(NECK_W, NECK_Y);
  const placketTop = NECK_Y + 13;
  const hemY = spec.length + (spec.hemCurve ?? 0);
  const placketL = polyline([CX - 3.5, placketTop + 1], [CX - 3.5, hemY - 1]);
  const placketR = polyline([CX + 3.5, placketTop + 1], [CX + 3.5, hemY - 1]);
  const buttons: string[] = [];
  for (let y = placketTop + 12; y < hemY - 14; y += 24) buttons.push(button(CX, y, 1.8));
  // Chest pocket on the wearer's left.
  const px = CX + spec.chestW * 0.3;
  const py = t.bodyY(0.08);
  const pocket = path([px, py], [L([px + 17, py]), L([px + 17, py + 15]), L([px + 8.5, py + 19.5]), L([px, py + 15])], true);
  // Cuffs: a band with a stitch line and one button.
  const cuffDepth = 12;
  const cuffMid = [
    (t.cuffOuter[0] + t.cuffInner[0]) / 2 - t.sleeveDir[0] * (cuffDepth / 2),
    (t.cuffOuter[1] + t.cuffInner[1]) / 2 - t.sleeveDir[1] * (cuffDepth / 2),
  ] as const;
  return phaseBreak(piece({
    base: [fill(t.outline)],
    lines: [
      t.sleeveShade,
      collar.fills,
      ink(
        stroke(t.edges),
        t.armSeams,
        t.cuffLines(cuffDepth),
        seam(t.hemLine(4)),
        seam(placketL),
        seam(placketR),
        seam(pocket),
      ),
      ...buttons,
      button(cuffMid[0], cuffMid[1], 1.6),
      button(2 * CX - cuffMid[0], cuffMid[1], 1.6),
      collar.lines,
    ],
    clip: t.outline,
    panels: t.panels,
    stripe: "v",
  }));
}

export const SHIRT: Record<string, KitPiece> = framedByType(fitTable("shirt", FITS, "regular", shirt));
