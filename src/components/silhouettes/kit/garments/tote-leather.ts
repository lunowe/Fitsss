/**
 * Leather tote, front view: a structured body wider at the top with a flat
 * base, slim rolled handles on stitched tabs, a top zip. Sits next to the
 * canvas tote (`tote.ts`) at the same scale.
 */
import { C, CX, FILL2, fill, ink, L, path, piece, polyline, Q, seam, shade, stroke, symmetric } from "../draw";
import type { KitPiece } from "../types";
import { roundRect } from "../parts-feet";

const TOP = 78;
const BOTTOM = 190;
const TOP_W = 70;
const BOTTOM_W = 62;
const HANDLE_X = 34;
const HANDLE_W = 5;

/** A rolled handle: a slim band between two arcs rising to `apex`. */
function handle(at: number, apex: number, w: number, y: number): string {
  const o = at + w / 2;
  const i = at - w / 2;
  return path([CX - o, y], [
    C([CX - o, apex + (y - apex) * 0.12], [CX - o * 0.55, apex], [CX, apex]),
    C([CX + o * 0.55, apex], [CX + o, apex + (y - apex) * 0.12], [CX + o, y]),
    L([CX + i, y]),
    C([CX + i, apex + w + (y - apex - w) * 0.12], [CX + i * 0.55, apex + w], [CX, apex + w]),
    C([CX - i * 0.55, apex + w], [CX - i, apex + w + (y - apex - w) * 0.12], [CX - i, y]),
  ], true);
}

function leatherTote(): KitPiece {
  const body = symmetric([CX, TOP], [
    L([CX + TOP_W - 3, TOP]),
    Q([CX + TOP_W, TOP], [CX + TOP_W, TOP + 3]),
    L([CX + BOTTOM_W + 1, BOTTOM - 8]),
    C([CX + BOTTOM_W + 0.5, BOTTOM - 3], [CX + BOTTOM_W - 2, BOTTOM], [CX + BOTTOM_W - 6, BOTTOM]),
    L([CX, BOTTOM]),
  ]);
  const front = handle(HANDLE_X, 12, HANDLE_W, TOP);
  const back = handle(HANDLE_X - 4, 8, HANDLE_W, TOP);
  // Stitched tabs anchor the handles to the face.
  const tab = (x: number) => roundRect(x - 6, TOP - 1, 12, 16, 2);
  const tabStitch = (x: number) => path([x - 4, TOP + 1.5], [L([x + 4, TOP + 1.5]), L([x + 4, TOP + 12.5]), L([x - 4, TOP + 12.5])], true);
  const topZip = polyline([CX - TOP_W + 4, TOP + 5], [CX + TOP_W - 4, TOP + 5]);
  const pull = roundRect(CX + 18, TOP + 3.5, 8, 3, 1);
  const baseSeam = polyline([CX - BOTTOM_W - 0.5, BOTTOM - 9], [CX + BOTTOM_W + 0.5, BOTTOM - 9]);
  // Base corners: a protective edge, one stitch along the bottom.
  return piece({
    base: [fill(body)],
    lines: [
      fill(back, FILL2),
      shade(back, 0.14),
      fill(front, FILL2),
      fill(tab(CX - HANDLE_X)),
      fill(tab(CX + HANDLE_X)),
      ink(
        stroke(back),
        stroke(front),
        stroke(body),
        stroke(tab(CX - HANDLE_X)),
        stroke(tab(CX + HANDLE_X)),
        seam(tabStitch(CX - HANDLE_X)),
        seam(tabStitch(CX + HANDLE_X)),
        seam(topZip),
        stroke(pull),
        seam(baseSeam),
      ),
    ],
    clip: body,
    extent: [body, front, back],
    graphic: [CX, 142, 50],
    logo: [CX, 140, 18],
  });
}

export const TOTE_LEATHER: Record<string, KitPiece> = {
  "tote~leather-tote": leatherTote(),
};
