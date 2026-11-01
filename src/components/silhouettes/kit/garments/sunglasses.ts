/**
 * Sunglasses, front view: the frame carries the color, the lenses are the
 * second color under a tint, the temples show as short tabs at the sides.
 * Wayfarer: thick trapezoid frame with a straight brow. Aviator: teardrop
 * lenses in a thin wire frame with a double bridge. Round: circles in a
 * thin frame. Sport: one wraparound shield under a heavy brow bar.
 */
import { button, C, CX, FILL2, fill, ink, L, mirrored, path, piece, polyline, Q, seam, shade, stroke, symmetric } from "../draw";
import type { KitPiece } from "../types";

const CY = 100;

/** A lens filled in the second color with a tint and a highlight. */
function lens(d: string): string {
  return fill(d, FILL2) + shade(d, 0.42);
}

/** A temple tab angling back from the frame's outer edge at (x, y). */
function temple(x: number, y: number, len: number, w: number, dirn: 1 | -1): string {
  return path([x, y - w / 2], [L([x + dirn * len, y - w / 2 + 1]), Q([x + dirn * (len + 2), y + 1], [x + dirn * len, y + w / 2 - 1]), L([x, y + w / 2])], true);
}

function wayfarer(): KitPiece {
  const fw = 6; // frame width
  // Right lens outer frame (trapezoid, outer corner higher), as a right-side half piece.
  const outer = (inset: number) =>
    path([CX + 4 + inset, CY - 20 + inset * 0.6], [
      L([CX + 86 - inset, CY - 24 + inset * 1.4]),
      C([CX + 90 - inset, CY - 24 + inset], [CX + 90 - inset, CY - 20 + inset], [CX + 89 - inset, CY - 16 + inset]),
      C([CX + 86 - inset, CY], [CX + 82 - inset, CY + 18 - inset], [CX + 70 - inset, CY + 22 - inset]),
      L([CX + 26 + inset, CY + 24 - inset]),
      C([CX + 10 + inset, CY + 24 - inset], [CX + 4 + inset, CY + 14 - inset], [CX + 4 + inset, CY + 4 - inset * 0.4]),
    ], true);
  const frameR = outer(0);
  const lensR = outer(fw);
  const bridge = path([CX - 4, CY - 18], [L([CX + 4, CY - 18]), L([CX + 4, CY - 8]), Q([CX, CY - 4], [CX - 4, CY - 8])], true);
  const brow = polyline([CX - 86, CY - 24], [CX + 86, CY - 24]);
  const tR = temple(CX + 89, CY - 16, 8, 6, 1);
  const hinge = button(CX + 84, CY - 17, 1.3);
  const frame = frameR + mirrored(frameR) + bridge;
  return piece({
    base: [fill(frameR), fill(mirrored(frameR)), fill(bridge)],
    lines: [
      fill(tR), fill(mirrored(tR)),
      lens(lensR), lens(mirrored(lensR)),
      ink(stroke(tR), stroke(mirrored(tR)), stroke(frameR), stroke(mirrored(frameR)), stroke(bridge), seam(brow), stroke(lensR), stroke(mirrored(lensR))),
      hinge,
      button(CX - 84, CY - 17, 1.3),
    ],
    clip: frame,
    extent: [frame, tR, mirrored(tR)],
  });
}

function aviator(): KitPiece {
  const fw = 2.5;
  // Teardrop: wide at the brow, tapering to a rounded bottom.
  const outer = (inset: number) =>
    path([CX + 6 + inset, CY - 22 + inset], [
      L([CX + 76 - inset, CY - 22 + inset]),
      C([CX + 88 - inset, CY - 22 + inset], [CX + 90 - inset, CY - 10 + inset], [CX + 86 - inset, CY + 2]),
      C([CX + 80 - inset, CY + 22 - inset], [CX + 64 - inset, CY + 32 - inset], [CX + 48, CY + 32 - inset]),
      C([CX + 26 + inset, CY + 32 - inset], [CX + 8 + inset, CY + 18 - inset], [CX + 6 + inset, CY + 2]),
    ], true);
  const frameR = outer(0);
  const lensR = outer(fw);
  const bridge = path([CX - 6, CY - 14], [Q([CX, CY - 20], [CX + 6, CY - 14]), L([CX + 6, CY - 11]), Q([CX, CY - 17], [CX - 6, CY - 11])], true);
  const bar = polyline([CX - 70, CY - 22], [CX + 70, CY - 22]);
  const topBar = path([CX - 60, CY - 27], [Q([CX, CY - 30], [CX + 60, CY - 27])]);
  const pad = path([CX + 9, CY - 2], [Q([CX + 13, CY + 2], [CX + 9, CY + 8])]);
  const tR = temple(CX + 89, CY - 14, 7, 4, 1);
  const frame = frameR + mirrored(frameR) + bridge;
  return piece({
    base: [fill(frameR), fill(mirrored(frameR)), fill(bridge)],
    lines: [
      fill(tR), fill(mirrored(tR)),
      lens(lensR), lens(mirrored(lensR)),
      ink(stroke(tR), stroke(mirrored(tR)), stroke(frameR), stroke(mirrored(frameR)), stroke(bridge), stroke(topBar), seam(bar), stroke(lensR), stroke(mirrored(lensR)), seam(pad), seam(mirrored(pad))),
    ],
    clip: frame,
    extent: [frame, tR, mirrored(tR), topBar],
  });
}

function round(): KitPiece {
  const r = 32;
  const cx = CX + 40;
  const fw = 3;
  const circle = (c: number, rad: number) => path([c - rad, CY], [C([c - rad, CY - rad * 1.33], [c + rad, CY - rad * 1.33], [c + rad, CY]), C([c + rad, CY + rad * 1.33], [c - rad, CY + rad * 1.33], [c - rad, CY])], true);
  const frameR = circle(cx, r);
  const lensR = circle(cx, r - fw);
  const bridge = path([CX - 8, CY - 10], [Q([CX, CY - 22], [CX + 8, CY - 10]), L([CX + 8, CY - 6]), Q([CX, CY - 18], [CX - 8, CY - 6])], true);
  const tR = temple(cx + r - 1, CY - 10, 10, 4, 1);
  const frame = frameR + mirrored(frameR) + bridge;
  return piece({
    base: [fill(frameR), fill(mirrored(frameR)), fill(bridge)],
    lines: [
      fill(tR), fill(mirrored(tR)),
      lens(lensR), lens(mirrored(lensR)),
      ink(stroke(tR), stroke(mirrored(tR)), stroke(frameR), stroke(mirrored(frameR)), stroke(bridge), stroke(lensR), stroke(mirrored(lensR))),
    ],
    clip: frame,
    extent: [frame, tR, mirrored(tR)],
  });
}

function sport(): KitPiece {
  // One shield lens under a heavy brow bar, wrapping back at the sides.
  const brow = symmetric([CX, CY - 24], [
    L([CX + 70, CY - 24]),
    C([CX + 84, CY - 24], [CX + 92, CY - 18], [CX + 94, CY - 8]),
    L([CX + 86, CY - 6]),
    C([CX + 84, CY - 12], [CX + 80, CY - 15], [CX + 70, CY - 15]),
    L([CX + 6, CY - 15]),
    Q([CX, CY - 12], [CX, CY - 12]),
  ]);
  const shield = symmetric([CX, CY - 12], [
    Q([CX + 4, CY - 15], [CX + 8, CY - 15]),
    L([CX + 70, CY - 15]),
    C([CX + 80, CY - 15], [CX + 84, CY - 12], [CX + 86, CY - 6]),
    C([CX + 84, CY + 12], [CX + 72, CY + 24], [CX + 48, CY + 24]),
    C([CX + 26, CY + 24], [CX + 10, CY + 10], [CX + 6, CY - 2]),
    Q([CX + 4, CY - 10], [CX, CY - 12]),
  ]);
  const tR = temple(CX + 93, CY - 14, 9, 8, 1);
  const vent = polyline([CX + 20, CY - 20], [CX + 56, CY - 20]);
  return piece({
    base: [fill(brow)],
    lines: [
      fill(tR), fill(mirrored(tR)),
      lens(shield),
      ink(stroke(tR), stroke(mirrored(tR)), stroke(shield), stroke(brow), seam(vent), seam(mirrored(vent))),
    ],
    clip: brow,
    extent: [brow, shield, tR, mirrored(tR)],
  });
}

export const SUNGLASSES: Record<string, KitPiece> = {
  "sunglasses~wayfarer": wayfarer(),
  "sunglasses~aviator": aviator(),
  "sunglasses~round": round(),
  "sunglasses~sport": sport(),
};
SUNGLASSES["sunglasses"] = SUNGLASSES["sunglasses~wayfarer"];
