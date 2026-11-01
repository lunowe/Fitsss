/**
 * Hoodie: pullover with a two-panel hood lying flat behind the shoulders, a
 * drawstring channel around the opening, kangaroo pocket, rib cuffs and hem.
 */
import { button, C, CX, FILL2, fill, ink, L, mirrored, path, piece, polyline, seam, shade, stroke, symmetric } from "../draw";
import type { KitPiece } from "../types";
import { crewNeck, torso, type TorsoSpec } from "../torso";

const NECK_Y = 42;
const NECK_W = 16;
const OPENING = 26; // depth of the front opening
const RIB = 10;

const BASE: Omit<TorsoSpec, "neck"> = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 61,
  shoulderDrop: 9,
  chestW: 60,
  hemW: 57,
  length: 178,
  armhole: 34,
  sleeveLen: 118,
  cuffW: 25,
  sleeveAngle: 75,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 56, chestW: 54, waistW: 50, hemW: 51, length: 172, armhole: 31, sleeveLen: 114, cuffW: 22, sleeveAngle: 77 },
  regular: {},
  relaxed: { shoulderW: 65, chestW: 65, hemW: 62, length: 182, armhole: 37, cuffW: 27 },
  oversized: { shoulderW: 75, shoulderDrop: 13, chestW: 75, hemW: 73, length: 198, armhole: 44, sleeveLen: 124, cuffW: 31, sleeveAngle: 73 },
  boxy: { shoulderW: 73, shoulderDrop: 11, chestW: 72, hemW: 72, length: 162, armhole: 42, sleeveLen: 116, cuffW: 30, sleeveAngle: 74 },
};

/** The hood: a wide dome behind the shoulders, split by its center seam. */
function hood(w: number, y: number, wide: number): { back: string; seam: string; apex: number } {
  const foot = w + wide;
  const apex = y - 30 - wide * 0.3;
  const back = symmetric([CX, apex], [C([CX + foot * 0.7, apex], [CX + foot, apex + (y - apex) * 0.45], [CX + foot, y + 6]), L([CX, y + 6])]);
  return { back, seam: polyline([CX, apex + 0.5], [CX, y - ARCH - 0.5]), apex };
}

/** How far the hood's inner edge rises above the shoulder line at the center. */
const ARCH = 9;

function hoodie(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit], neck: crewNeck(NECK_W, NECK_Y, OPENING) };
  const t = torso(spec);
  const h = hood(NECK_W, NECK_Y, Math.max(0, (spec.shoulderW - 61) * 0.35) + 18);
  // Inside of the hood, seen through the opening: the front U continued by
  // an arch rising into the hood.
  const opening = (hw: number, depth: number, arch: number) =>
    symmetric([CX, NECK_Y + depth], [
      C([CX + hw * 0.55, NECK_Y + depth], [CX + hw, NECK_Y + depth * 0.55], [CX + hw, NECK_Y + depth * 0.15]),
      C([CX + hw, NECK_Y - arch * 0.85], [CX + hw * 0.55, NECK_Y - arch], [CX, NECK_Y - arch]),
    ]);
  const lining = opening(NECK_W, OPENING, ARCH);
  // Drawstring channel: a seam running around the opening.
  const ch = 5;
  const channel = opening(NECK_W + ch, OPENING + ch, ARCH + ch);
  const grommetY = NECK_Y + OPENING + 1;
  const string = (x: number, k: number) => path([x, grommetY + 2], [C([x + 2 * k, grommetY + 16], [x + 0.5 * k, grommetY + 30], [x + 3 * k, grommetY + 42])]);
  // Kangaroo pocket.
  const pw = spec.chestW - 15;
  const pTop = spec.length - RIB - 44;
  const pBot = spec.length - RIB - 3;
  const pocket = symmetric([CX, pTop], [L([CX + pw - 13, pTop]), L([CX + pw, pTop + 12]), L([CX + pw, pBot]), L([CX, pBot])]);
  const graphicY = t.armpit[1] + (pTop - t.armpit[1]) * 0.5;
  const graphicSize = Math.min(34, Math.round((pTop - (NECK_Y + OPENING + ch) - 8)));
  const block = h.back + t.sleevePanel() + mirrored(t.sleevePanel());
  return piece({
    base: [fill(h.back), fill(t.outline)],
    lines: [
      fill(lining),
      shade(lining, 0.26),
      fill(t.hemBand(RIB), FILL2),
      fill(t.cuffBand(RIB), FILL2),
      fill(mirrored(t.cuffBand(RIB)), FILL2),
      ink(
        stroke(h.back),
        seam(h.seam),
        stroke(t.outline),
        t.armSeams,
        t.cuffLines(RIB),
        seam(t.hemLine(RIB)),
        seam(channel),
        stroke(string(CX - 6, -1)),
        stroke(string(CX + 6, 1)),
        seam(pocket),
        stroke(polyline([CX - pw + 13, pTop], [CX - pw, pTop + 12])),
        stroke(polyline([CX + pw - 13, pTop], [CX + pw, pTop + 12])),
      ),
      button(CX - 6, grommetY, 1.6),
      button(CX + 6, grommetY, 1.6),
    ],
    clip: h.back + t.outline,
    extent: [h.back, t.outline],
    graphic: [CX, graphicY, graphicSize],
    logo: [CX + spec.chestW * 0.42, NECK_Y + OPENING + 4, 12],
    block,
  });
}

export const HOODIE: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`hoodie@${fit}`, hoodie(fit)]),
);
HOODIE["hoodie"] = HOODIE["hoodie@regular"];

