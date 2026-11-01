/**
 * Sandals, side view, toe right, the lowest shoes in the family: a footbed
 * in the second color with the straps of each variant arching over it. The
 * strap itself is the garment: it carries the color and the pattern clip.
 */
import { C, fill, ink, L, path, piece, polyline, seam, shade, stroke } from "../draw";
import type { KitPiece } from "../types";
import { buckle, footSole, GROUND } from "../parts-feet";

const X0 = 22;
const X1 = 184;

/**
 * A strap arching over the footbed from x = a to x = b, `h` high, `w` wide:
 * the outer arch, and the inner arch through which the far side shows.
 */
function arch(a: number, b: number, h: number, w: number): { outer: string; inner: string; band: string } {
  const top = GROUND - h;
  const outer = path([a, GROUND], [C([a + 1, top + 2], [a + (b - a) * 0.3, top], [(a + b) / 2, top]), C([b - (b - a) * 0.3, top], [b - 1, top + 2], [b, GROUND])]);
  const ia = a + w;
  const ib = b - w;
  const it = top + w;
  const innerSegs = [C([ia + 1, it + 2], [ia + (ib - ia) * 0.3, it], [(ia + ib) / 2, it]), C([ib - (ib - ia) * 0.3, it], [ib - 1, it + 2], [ib, GROUND])] as const;
  const inner = path([ia, GROUND], [...innerSegs]);
  // The band between the arches as one closed shape.
  const band = path([a, GROUND], [
    C([a + 1, top + 2], [a + (b - a) * 0.3, top], [(a + b) / 2, top]),
    C([b - (b - a) * 0.3, top], [b - 1, top + 2], [b, GROUND]),
    L([ib, GROUND]),
    C([ib - 1, it + 2], [ib - (ib - ia) * 0.3, it], [(ia + ib) / 2, it]),
    C([ia + (ib - ia) * 0.3, it], [ia + 1, it + 2], [ia, GROUND]),
  ], true);
  return { outer, inner, band };
}

/** The far side of a strap, seen through the arch. */
const through = (inner: string) => fill(inner + "Z") + shade(inner + "Z", 0.22);

function slide(): KitPiece {
  const s = footSole({ x0: X0, x1: X1, depth: 13, spring: 3, midsole: true });
  const a = arch(62, 150, 44, 17);
  const stitches = [seam(path([66, GROUND - 2], [C([67, 82], [90, 76], [106, 76]), C([122, 76], [145, 82], [146, GROUND - 2])]))];
  return piece({
    base: [fill(a.band)],
    lines: [through(a.inner), s.fills, ink(stroke(a.outer), stroke(a.inner), ...stitches), s.lines],
    clip: a.band,
    extent: [a.band, s.path],
  });
}

function strap(): KitPiece {
  const s = footSole({ x0: X0, x1: X1, depth: 9, spring: 3, midsole: true });
  const toe = arch(134, 170, 18, 6);
  const instep = arch(82, 130, 34, 6.5);
  // Ankle strap: runs back from the instep strap and wraps the heel, buckled on the side.
  const ankle = path([96, 90], [
    C([80, 90], [52, 90], [36, 88]),
    C([27, 87], [23, 96], [22, GROUND - 6]),
    L([28, GROUND - 6]),
    C([29, 100], [32, 94], [38, 94]),
    C([54, 95], [80, 96.5], [96, 96.5]),
  ], true);
  const b = buckle(60, 92.5, 7, 9, 2.4);
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
  const s = footSole({ x0: X0, x1: X1, depth: 7, spring: 3 });
  // The thong: a post near the toe, a strap running back over the foot to the footbed's edge.
  const thong = path([152, GROUND], [
    L([150, 106]),
    C([140, 90], [116, 84], [90, 96]),
    C([82, 100], [78, 108], [76, GROUND]),
    L([84, GROUND]),
    C([86, 108], [90, 102], [96, 100]),
    C([116, 92], [134, 96], [144, 110]),
    L([146, GROUND]),
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
  const back = arch(76, 132, 40, 13);
  const front = arch(134, 178, 28, 12);
  const b1 = buckle(88, 98, 7, 9, 2.4);
  const b2 = buckle(142, 104, 7, 9, 2.4);
  // The footbed's suede liner and a toe bar on its top.
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


