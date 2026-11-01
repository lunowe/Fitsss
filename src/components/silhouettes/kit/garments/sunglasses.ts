/**
 * Sunglasses, upright front view, the way a shop shows them, so the pair
 * sits level with the other flat lays. The frame carries the color; the lenses are the second color under a tint,
 * so they read as tinted glass on white, black and rust frames alike; the
 * temples show as short tabs at the sides. Wayfarer: thick trapezoid frame
 * with a straight brow. Aviator: teardrop lenses in a thin wire frame with
 * a double bridge. Round: circles in a thin frame. Sport: one wraparound
 * shield under a heavy brow bar.
 */
import { button, C, CX, FILL2, fill, ink, L, mirrored, path, piece, polyline, Q, seam, shade, stroke, symmetric } from "../draw";
import type { KitPiece } from "../types";

const CY = 100;

/**
 * A lens: the second color under a strong tint, so the glass is clearly
 * darker than a light frame and clearly lighter than a dark one, and the
 * frame stays a visible band of its own color on every tile.
 */
function lens(d: string): string {
  return fill(d, FILL2) + shade(d, 0.34);
}

/** A temple tab angling back from the frame's outer edge at (x, y). */
function temple(x: number, y: number, len: number, w: number, dirn: 1 | -1): string {
  return path([x, y - w / 2], [L([x + dirn * len, y - w / 2 + 1]), Q([x + dirn * (len + 2), y + 1], [x + dirn * len, y + w / 2 - 1]), L([x, y + w / 2])], true);
}


function wayfarer(): KitPiece {
  const fw = 10; // frame width: thick acetate
  // Right lens outer frame (trapezoid, outer corner higher), as a right-side half piece.
  const outer = (inset: number) =>
    path([CX + 4 + inset, CY - 24 + inset * 0.6], [
      L([CX + 84 - inset, CY - 30 + inset * 1.4]),
      C([CX + 89 - inset, CY - 30 + inset], [CX + 90.5 - inset, CY - 24 + inset], [CX + 89.5 - inset, CY - 18 + inset]),
      C([CX + 86 - inset, CY + 4], [CX + 82 - inset, CY + 27 - inset], [CX + 68 - inset, CY + 31 - inset]),
      L([CX + 26 + inset, CY + 33 - inset]),
      C([CX + 10 + inset, CY + 33 - inset], [CX + 4 + inset, CY + 19 - inset], [CX + 4 + inset, CY + 6 - inset * 0.4]),
    ], true);
  const frameR = outer(0);
  const lensR = outer(fw);
  const bridge = path([CX - 4, CY - 21.5], [L([CX + 4, CY - 21.5]), L([CX + 4, CY - 9]), Q([CX, CY - 4], [CX - 4, CY - 9])], true);
  const brow = polyline([CX - 84, CY - 30], [CX + 84, CY - 30]);
  const tR = temple(CX + 89.5, CY - 19, 10, 8, 1);
  const glint = path([CX + 16, CY - 8], [L([CX + 26, CY - 14])]);
  const frame = frameR + mirrored(frameR) + bridge;
  return piece({
    base: [fill(frameR), fill(mirrored(frameR)), fill(bridge)],
    lines: [
      fill(tR), fill(mirrored(tR)),
      lens(lensR), lens(mirrored(lensR)),
      ink(stroke(tR), stroke(mirrored(tR)), stroke(frameR), stroke(mirrored(frameR)), stroke(bridge), seam(brow), stroke(lensR), stroke(mirrored(lensR)), seam(glint), seam(mirrored(glint))),
      button(CX + 82.5, CY - 22, 1.5),
      button(CX + 82.5, CY - 16, 1.5),
      button(CX - 82.5, CY - 22, 1.5),
      button(CX - 82.5, CY - 16, 1.5),
    ],
    clip: frame,
    extent: [frame, tR, mirrored(tR)],
  });
}

function aviator(): KitPiece {
  const fw = 3.4;
  // Teardrop: wide at the brow, tapering to a rounded bottom.
  const outer = (inset: number) =>
    path([CX + 6 + inset, CY - 24 + inset], [
      L([CX + 76 - inset, CY - 24 + inset]),
      C([CX + 88 - inset, CY - 24 + inset], [CX + 91 - inset, CY - 10 + inset], [CX + 87 - inset, CY + 4]),
      C([CX + 81 - inset, CY + 26 - inset], [CX + 64 - inset, CY + 36 - inset], [CX + 48, CY + 36 - inset]),
      C([CX + 26 + inset, CY + 36 - inset], [CX + 8 + inset, CY + 20 - inset], [CX + 6 + inset, CY + 4]),
    ], true);
  const frameR = outer(0);
  const lensR = outer(fw);
  const bridge = path([CX - 6, CY - 15], [Q([CX, CY - 21], [CX + 6, CY - 15]), L([CX + 6, CY - 12]), Q([CX, CY - 18], [CX - 6, CY - 12])], true);
  const bar = polyline([CX - 70, CY - 24], [CX + 70, CY - 24]);
  const topBar = path([CX - 62, CY - 29], [Q([CX, CY - 33], [CX + 62, CY - 29])]);
  const pad = path([CX + 9, CY - 2], [Q([CX + 13, CY + 2], [CX + 9, CY + 8])]);
  const tR = temple(CX + 90, CY - 15, 8, 4.5, 1);
  const glint = path([CX + 16, CY - 12], [L([CX + 26, CY - 17])]);
  const frame = frameR + mirrored(frameR) + bridge;
  return piece({
    base: [fill(frameR), fill(mirrored(frameR)), fill(bridge)],
    lines: [
      fill(tR), fill(mirrored(tR)),
      lens(lensR), lens(mirrored(lensR)),
      ink(stroke(tR), stroke(mirrored(tR)), stroke(frameR), stroke(mirrored(frameR)), stroke(bridge), stroke(topBar), seam(bar), stroke(lensR), stroke(mirrored(lensR)), seam(pad), seam(mirrored(pad)), seam(glint), seam(mirrored(glint))),
    ],
    clip: frame,
    extent: [frame, tR, mirrored(tR), topBar],
  });
}

function round(): KitPiece {
  const r = 34;
  const cx = CX + 42;
  const fw = 4.2;
  const circle = (c: number, rad: number) => path([c - rad, CY], [C([c - rad, CY - rad * 1.33], [c + rad, CY - rad * 1.33], [c + rad, CY]), C([c + rad, CY + rad * 1.33], [c - rad, CY + rad * 1.33], [c - rad, CY])], true);
  const frameR = circle(cx, r);
  const lensR = circle(cx, r - fw);
  const bridge = path([CX - 8, CY - 10], [Q([CX, CY - 23], [CX + 8, CY - 10]), L([CX + 8, CY - 6]), Q([CX, CY - 19], [CX - 8, CY - 6])], true);
  const tR = temple(cx + r - 1, CY - 10, 10, 4.5, 1);
  const glint = path([cx - 20, CY - 6], [Q([cx - 18, CY - 16], [cx - 10, CY - 21])]);
  const frame = frameR + mirrored(frameR) + bridge;
  return piece({
    base: [fill(frameR), fill(mirrored(frameR)), fill(bridge)],
    lines: [
      fill(tR), fill(mirrored(tR)),
      lens(lensR), lens(mirrored(lensR)),
      ink(stroke(tR), stroke(mirrored(tR)), stroke(frameR), stroke(mirrored(frameR)), stroke(bridge), stroke(lensR), stroke(mirrored(lensR)), seam(glint), seam(mirrored(glint))),
    ],
    clip: frame,
    extent: [frame, tR, mirrored(tR)],
  });
}

function sport(): KitPiece {
  // One shield lens under a heavy brow bar, wrapping back at the sides.
  const brow = symmetric([CX, CY - 26], [
    L([CX + 70, CY - 26]),
    C([CX + 84, CY - 26], [CX + 92, CY - 20], [CX + 94, CY - 8]),
    L([CX + 86, CY - 6]),
    C([CX + 84, CY - 13], [CX + 80, CY - 16], [CX + 70, CY - 16]),
    L([CX + 6, CY - 16]),
    Q([CX, CY - 13], [CX, CY - 13]),
  ]);
  const shield = symmetric([CX, CY - 13], [
    Q([CX + 4, CY - 16], [CX + 8, CY - 16]),
    L([CX + 70, CY - 16]),
    C([CX + 80, CY - 16], [CX + 84, CY - 13], [CX + 86, CY - 6]),
    C([CX + 84, CY + 14], [CX + 72, CY + 28], [CX + 48, CY + 28]),
    C([CX + 26, CY + 28], [CX + 10, CY + 12], [CX + 6, CY - 1]),
    Q([CX + 4, CY - 10], [CX, CY - 13]),
  ]);
  const tR = temple(CX + 93, CY - 15, 10, 9, 1);
  const vent = polyline([CX + 20, CY - 22], [CX + 56, CY - 22]);
  const glint = path([CX + 18, CY - 4], [L([CX + 30, CY - 10])]);
  return piece({
    base: [fill(brow)],
    lines: [
      fill(tR), fill(mirrored(tR)),
      lens(shield),
      ink(stroke(tR), stroke(mirrored(tR)), stroke(shield), stroke(brow), seam(vent), seam(mirrored(vent)), seam(glint), seam(mirrored(glint))),
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
