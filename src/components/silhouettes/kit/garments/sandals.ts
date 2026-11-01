/**
 * Sandals, side view, toe right, the lowest shoes in the family: a footbed
 * in the second color with the straps of each variant rising over it as
 * low, flat-topped bands. The strap itself is the garment: it carries the
 * color and the pattern clip.
 */
import { C, fill, ink, L, path, piece, polyline, seam, shade, stroke } from "../draw";
import type { KitPiece } from "../types";
import { buckle, footSole, GROUND, strapArch } from "../parts-feet";

const X0 = 22;
const X1 = 184;

/** The far side of a strap, seen through the arch. */
const through = (inner: string) => fill(inner + "Z") + shade(inner + "Z", 0.22);

function slide(): KitPiece {
  // A contoured footbed, thicker at the heel, and one broad band over the instep.
  const s = footSole({ x0: X0, x1: X1, depth: 13, spring: 3, heelLift: 4, midsole: true });
  const a = strapArch(52, 154, 34, 18, 16);
  return piece({
    base: [fill(a.band)],
    lines: [through(a.inner), s.fills, ink(stroke(a.outer), stroke(a.inner), seam(a.inset(4)), seam(a.inset(14))), s.lines],
    clip: a.band,
    extent: [a.band, s.path],
  });
}

function strap(): KitPiece {
  const s = footSole({ x0: X0, x1: X1, depth: 11, spring: 3, midsole: true });
  const toe = strapArch(136, 170, 15, 7, 7);
  const instep = strapArch(82, 130, 27, 8, 11);
  // Ankle strap: runs back from the instep strap and wraps the heel, buckled on the side.
  const ankle = path([96, 93], [
    C([80, 93], [52, 93], [36, 91]),
    C([27, 90], [23, 98], [22, GROUND - 6]),
    L([28, GROUND - 6]),
    C([29, 102], [32, 97], [38, 97]),
    C([54, 98], [80, 99.5], [96, 99.5]),
  ], true);
  const b = buckle(60, 95.5, 7, 9, 2.4);
  return piece({
    base: [fill(toe.band), fill(instep.band), fill(ankle)],
    lines: [
      through(toe.inner),
      through(instep.inner),
      s.fills,
      ink(stroke(toe.outer), stroke(toe.inner), stroke(instep.outer), stroke(instep.inner), stroke(ankle)),
      b.fills,
      b.lines,
      s.lines,
    ],
    clip: toe.band + instep.band + ankle,
    extent: [toe.band, instep.band, ankle, s.path],
  });
}

function flipFlop(): KitPiece {
  const s = footSole({ x0: X0, x1: X1, depth: 10, spring: 3, midsole: true });
  // The thong: a post near the toe, a strap running back over the foot to the footbed's edge.
  const thong = path([154, GROUND], [
    L([151, 104]),
    C([140, 86], [114, 80], [88, 94]),
    C([79, 99], [75, 108], [73, GROUND]),
    L([84, GROUND]),
    C([86, 107], [90, 101], [96, 99]),
    C([116, 90], [132, 94], [143, 110]),
    L([145, GROUND]),
  ], true);
  return piece({
    base: [fill(thong)],
    lines: [s.fills, ink(stroke(thong)), s.lines],
    clip: thong,
    extent: [thong, s.path],
  });
}

function cork(): KitPiece {
  const s = footSole({ x0: X0, x1: X1, depth: 15, spring: 3, midsole: true });
  const back = strapArch(72, 132, 32, 12, 13);
  const front = strapArch(136, 178, 22, 11, 9);
  const b1 = buckle(86, 100, 7, 9, 2.4);
  const b2 = buckle(143, 106, 7, 9, 2.4);
  // The footbed's suede liner on its top.
  const liner = polyline([X0 + 1, GROUND + 3], [X1, GROUND + 2]);
  return piece({
    base: [fill(back.band), fill(front.band)],
    lines: [
      through(back.inner),
      through(front.inner),
      s.fills,
      ink(stroke(back.outer), stroke(back.inner), stroke(front.outer), stroke(front.inner), seam(liner)),
      b1.fills,
      b1.lines,
      b2.fills,
      b2.lines,
      s.lines,
    ],
    clip: back.band + front.band,
    extent: [back.band, front.band, s.path],
  });
}

export const SANDALS: Record<string, KitPiece> = {
  "sandals~slide": slide(),
  "sandals~strap": strap(),
  "sandals~flip-flop": flipFlop(),
  "sandals~cork": cork(),
};
SANDALS["sandals"] = SANDALS["sandals~slide"];
