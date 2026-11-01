/**
 * Vest: a layering gilet (the catalog's first material is nylon). Sleeveless
 * with bound armholes, a stand collar, a full zip, two welt pockets and three
 * quilted channels.
 */
import { C, CX, FILL2, fill, ink, L, mirrored, path, piece, polyline, Q, seam, stroke, symmetric, type Pt } from "../draw";
import { frame, standCollar, standNeck, zip } from "../parts-tops";
import type { KitPiece } from "../types";

const NECK_Y = 36;
const NECK_W = 15;
const COLLAR_H = 13;

interface VestSpec {
  /** Half width at the shoulder tips (the strap's outer edge). */
  shoulderW: number;
  /** Half width at the armpit. */
  chestW: number;
  waistW: number;
  hemW: number;
  /** Depth of the armhole below the shoulder tip. */
  armhole: number;
  length: number;
}

const BASE: VestSpec = { shoulderW: 42, chestW: 55, waistW: 53, hemW: 54, armhole: 40, length: NECK_Y + 124 };

const FITS: Record<string, Partial<VestSpec>> = {
  fitted: { shoulderW: 39, chestW: 48, waistW: 43, hemW: 46, armhole: 37, length: NECK_Y + 118 },
  regular: {},
  relaxed: { shoulderW: 46, chestW: 62, waistW: 61, hemW: 61, armhole: 44, length: NECK_Y + 132 },
};

function vest(fit: string): KitPiece {
  const s = { ...BASE, ...FITS[fit] };
  const neck = standNeck(NECK_W, NECK_Y);
  const o = NECK_W + 3;
  const S: Pt = [CX + s.shoulderW, NECK_Y + 7];
  const A: Pt = [CX + s.chestW, S[1] + s.armhole];
  const H: Pt = [CX + s.hemW, s.length];
  const outline = symmetric(neck.start, [
    ...neck.segs,
    Q([CX + o + (s.shoulderW - o) * 0.55, NECK_Y + 2], S),
    // armhole: drops from the shoulder tip and scoops in to the armpit
    C([CX + s.shoulderW - 1, S[1] + s.armhole * 0.5], [CX + s.chestW - 9, A[1] - 1], A),
    C([CX + s.waistW, A[1] + (s.length - A[1]) * 0.45], [CX + s.hemW, A[1] + (s.length - A[1]) * 0.8], H),
    L([CX, s.length]),
  ]);
  const collar = standCollar(NECK_W, NECK_Y, COLLAR_H);
  const neckSeam = path([CX - o, NECK_Y + 2], [Q([CX - NECK_W * 0.7, NECK_Y + 9], [CX, NECK_Y + 9]), Q([CX + NECK_W * 0.7, NECK_Y + 9], [CX + o, NECK_Y + 2])]);
  // Armhole binding: a seam just inside the armhole curve.
  const binding = path([CX + s.shoulderW - 3.5, S[1] + 1], [C([CX + s.shoulderW - 4.5, S[1] + s.armhole * 0.5], [CX + s.chestW - 10, A[1] - 4], [CX + s.chestW - 1, A[1] - 3.5])]);
  const z = zip(NECK_Y - COLLAR_H, s.length - 1);
  // Quilt channels across the body, broken by the zip.
  const channels: string[] = [];
  const first = A[1] + 10;
  const step = (s.length - 12 - first) / 3;
  for (let i = 0; i < 3; i++) {
    const y = first + step * (i + 0.5);
    const xr = CX + s.waistW + (s.hemW - s.waistW) * ((y - A[1]) / (s.length - A[1])) - 1.5;
    channels.push(seam(polyline([CX + 4, y], [xr, y])), seam(polyline([2 * CX - xr, y], [CX - 4, y])));
  }
  // Welt pockets: a short slanted opening each side, between the lower channels.
  const py = first + step * 1.5 + 4.5;
  const welt = path([CX + s.waistW * 0.8, py], [L([CX + s.waistW * 0.42, py + 9])]);
  const hemLine = polyline([CX - s.hemW + 2, s.length - 4], [CX + s.hemW - 2, s.length - 4]);
  return piece({
    base: [fill(collar.shape), fill(outline)],
    lines: [
      ink(
        stroke(collar.shape),
        stroke(outline),
        collar.lines,
        seam(neckSeam),
        seam(binding),
        seam(mirrored(binding)),
        ...channels,
        stroke(welt),
        stroke(mirrored(welt)),
        seam(hemLine),
        z.lines,
      ),
      fill(z.pull, FILL2),
      ink(stroke(z.pull)),
    ],
    clip: collar.shape + outline,
    extent: [outline, collar.shape, frame(150, 100)],
  });
}

export const VEST: Record<string, KitPiece> = Object.fromEntries(
  Object.keys(FITS).map((fit) => [`vest@${fit}`, vest(fit)]),
);
VEST["vest"] = VEST["vest@regular"];
