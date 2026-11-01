/**
 * Tote: the canvas tote, front view. A slightly tapered body, two handles in
 * the second color sewn onto the face, a bottom seam.
 */
import { C, CX, FILL2, fill, ink, L, path, piece, polyline, seam, shade, stroke, symmetric } from "../draw";
import type { KitPiece } from "../types";

const TOP = 76;
const BOTTOM = 192;
const TOP_W = 66;
const BOTTOM_W = 58;
const STRAP_X = 35; // center of each strap from the center line
const STRAP_W = 7;

/** A handle: a band between two arcs rising to `apex`, anchored at x = CX ± at. */
function handle(at: number, apex: number, w: number, y: number): string {
  const o = at + w / 2;
  const i = at - w / 2;
  return path([CX - o, y], [
    C([CX - o, apex + (y - apex) * 0.1], [CX - o * 0.6, apex], [CX, apex]),
    C([CX + o * 0.6, apex], [CX + o, apex + (y - apex) * 0.1], [CX + o, y]),
    L([CX + i, y]),
    C([CX + i, apex + w + (y - apex - w) * 0.1], [CX + i * 0.6, apex + w], [CX, apex + w]),
    C([CX - i * 0.6, apex + w], [CX - i, apex + w + (y - apex - w) * 0.1], [CX - i, y]),
  ], true);
}

function canvasTote(): KitPiece {
  const body = symmetric([CX, TOP], [
    L([CX + TOP_W, TOP]),
    L([CX + BOTTOM_W + 1, BOTTOM - 6]),
    C([CX + BOTTOM_W + 0.5, BOTTOM - 2], [CX + BOTTOM_W - 2, BOTTOM], [CX + BOTTOM_W - 5, BOTTOM]),
    L([CX, BOTTOM]),
  ]);
  const front = handle(STRAP_X, 12, STRAP_W, TOP);
  const back = handle(STRAP_X - 4, 8, STRAP_W, TOP);
  // Strap tails sewn on the face, with a box stitch at the end.
  const tailBottom = TOP + 30;
  const tail = path([CX + STRAP_X - STRAP_W / 2, TOP], [L([CX + STRAP_X + STRAP_W / 2, TOP]), L([CX + STRAP_X + STRAP_W / 2, tailBottom]), L([CX + STRAP_X - STRAP_W / 2, tailBottom])], true);
  const tailL = path([CX - STRAP_X - STRAP_W / 2, TOP], [L([CX - STRAP_X + STRAP_W / 2, TOP]), L([CX - STRAP_X + STRAP_W / 2, tailBottom]), L([CX - STRAP_X - STRAP_W / 2, tailBottom])], true);
  const boxStitch = (x: number) => polyline([x - STRAP_W / 2 + 0.5, tailBottom - 5], [x + STRAP_W / 2 - 0.5, tailBottom - 5]);
  const topHem = polyline([CX - TOP_W + 1.5, TOP + 4], [CX + TOP_W - 1.5, TOP + 4]);
  const baseSeam = polyline([CX - BOTTOM_W - 0.5, BOTTOM - 7], [CX + BOTTOM_W + 0.5, BOTTOM - 7]);
  return piece({
    base: [fill(body)],
    lines: [
      fill(back, FILL2),
      shade(back, 0.14),
      fill(front, FILL2),
      fill(tail, FILL2),
      fill(tailL, FILL2),
      ink(
        stroke(back),
        stroke(front),
        stroke(body),
        stroke(tail),
        stroke(tailL),
        seam(boxStitch(CX + STRAP_X)),
        seam(boxStitch(CX - STRAP_X)),
        seam(topHem),
        seam(baseSeam),
      ),
    ],
    clip: body,
    extent: [body, front, back],
    graphic: [CX, 146, 54],
    logo: [CX, 142, 20],
  });
}

export const TOTE: Record<string, KitPiece> = {
  "tote~canvas-tote": canvasTote(),
};
