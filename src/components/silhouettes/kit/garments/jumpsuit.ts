/**
 * Jumpsuit: a short-sleeve utility one-piece. Point collar, buttoned front to
 * a waist seam, two chest pockets, slanted hip pockets and straight legs; the
 * fit sets the waist and the leg.
 */
import { button, C, CX, fill, ink, L, mirrored, path, piece, polyline, Q, seam, stroke, symmetric, type Pt } from "../draw";
import { placket, sleeve, vNeckUnder } from "../parts-tops";
import type { KitPiece } from "../types";
import { pointCollar } from "./shirt";

const NECK_Y = 22;
const NECK_W = 14;
const WAIST_Y = 122;
const CROTCH_Y = 182;
const LENGTH = 304;

interface JumpsuitSpec {
  shoulderW: number;
  chestW: number;
  waistW: number;
  hipW: number;
  /** Width of one leg at the knee and at the hem. */
  kneeW: number;
  hemW: number;
  gap: number;
}

const FITS: Record<string, JumpsuitSpec> = {
  fitted: { shoulderW: 52, chestW: 48, waistW: 39, hipW: 43, kneeW: 27, hemW: 21, gap: 6 },
  relaxed: { shoulderW: 55, chestW: 52, waistW: 46, hipW: 47, kneeW: 34, hemW: 31, gap: 7 },
  wide: { shoulderW: 55, chestW: 52, waistW: 45, hipW: 48, kneeW: 40, hemW: 48, gap: 8 },
};

function jumpsuit(fit: string): KitPiece {
  const s = FITS[fit];
  const neck = vNeckUnder(NECK_W, NECK_Y);
  const S: Pt = [CX + s.shoulderW, NECK_Y + 8];
  const A: Pt = [CX + s.chestW, S[1] + 30];
  const sl = sleeve(S, A, 30, 30, 24);
  const waist: Pt = [CX + s.waistW, WAIST_Y];
  const hipY = WAIST_Y + 34;
  const hip: Pt = [CX + s.hipW, hipY];
  const kneeY = CROTCH_Y + (LENGTH - CROTCH_Y) * 0.47;
  const kneeGap = Math.min(s.gap, 6);
  const kneeOuter: Pt = [CX + kneeGap / 2 + s.kneeW, kneeY];
  const kneeInner: Pt = [CX + kneeGap / 2, kneeY];
  const hemOuter: Pt = [CX + s.gap / 2 + s.hemW, LENGTH];
  const hemInner: Pt = [CX + s.gap / 2, LENGTH];
  const outline = symmetric(neck.start, [
    ...neck.segs,
    Q([CX + NECK_W + (s.shoulderW - NECK_W) * 0.55, NECK_Y + 2], S),
    ...sl.segs,
    // body: in to the waist, out over the hip
    C([CX + s.chestW - 1, A[1] + (WAIST_Y - A[1]) * 0.45], [CX + s.waistW + 0.5, A[1] + (WAIST_Y - A[1]) * 0.8], waist),
    C([CX + s.waistW + (s.hipW - s.waistW) * 0.4, WAIST_Y + 12], [CX + s.hipW, hipY - 14], hip),
    // outseam: hip → knee → hem
    C([CX + s.hipW, hipY + (kneeY - hipY) * 0.5], [kneeOuter[0], kneeY - (kneeY - hipY) * 0.35], kneeOuter),
    C([kneeOuter[0], kneeY + (LENGTH - kneeY) * 0.35], [hemOuter[0], LENGTH - (LENGTH - kneeY) * 0.45], hemOuter),
    L(hemInner),
    // inseam: hem → knee → crotch
    C([hemInner[0], LENGTH - (LENGTH - kneeY) * 0.45], [kneeInner[0], kneeY + (LENGTH - kneeY) * 0.35], kneeInner),
    C([kneeInner[0], kneeY - (kneeY - CROTCH_Y) * 0.4], [CX + 2, CROTCH_Y + 6], [CX, CROTCH_Y]),
  ]);
  const collar = pointCollar(NECK_W, NECK_Y);
  const p = placket(NECK_Y + 14, WAIST_Y - 0.5, 3.5, 0, false);
  const buttons: string[] = [];
  for (let y = NECK_Y + 13 + 13; y < WAIST_Y - 8; y += 23) buttons.push(button(CX, y, 1.8));
  // Chest patch pockets either side of the placket.
  const pw = 17;
  const ph = 15;
  const px = CX + 10;
  const py = A[1] + 6;
  const pocket = path([px, py], [L([px + pw, py]), L([px + pw, py + ph]), L([px, py + ph])], true);
  // Hip pockets: a curved opening from the waist seam to the side.
  const hipPocket = path([CX + s.waistW - 16, WAIST_Y + 1], [Q([CX + s.waistW - 4, WAIST_Y + 6], [CX + s.hipW - 1, WAIST_Y + 24])]);
  const centerSeam = polyline([CX, WAIST_Y], [CX, CROTCH_Y]);
  const hemLine = polyline([hemInner[0] + 1.5, LENGTH - 4], [hemOuter[0] - 1.5, LENGTH - 4]);
  return piece({
    base: [fill(outline)],
    lines: [
      collar.fills,
      ink(
        stroke(outline),
        sl.armSeams,
        sl.cuffLines(3.5),
        p.lines,
        seam(polyline([CX - s.waistW + 1.5, WAIST_Y], [CX + s.waistW - 1.5, WAIST_Y])),
        seam(centerSeam),
        seam(pocket),
        seam(mirrored(pocket)),
        stroke(path([px, py], [L([px + pw, py])])),
        stroke(path([2 * CX - px, py], [L([2 * CX - px - pw, py])])),
        seam(hipPocket),
        seam(mirrored(hipPocket)),
        seam(hemLine),
        seam(mirrored(hemLine)),
      ),
      ...buttons,
      collar.lines,
    ],
    clip: outline,
    stripe: "v",
  });
}

export const JUMPSUIT: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`jumpsuit@${fit}`, jumpsuit(fit)]),
);
JUMPSUIT["jumpsuit"] = JUMPSUIT["jumpsuit@relaxed"];
