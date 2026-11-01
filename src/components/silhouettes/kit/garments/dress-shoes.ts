/**
 * Dress shoes, side view, toe right: a sleek last with a long vamp and an
 * almond toe on a thin welted sole with a stacked heel. The oxford's closed
 * lacing is a narrow V facing stitched under the vamp, with a cap toe; the
 * derby's open lacing is a free flap on top of a plain vamp; the monk has
 * no laces, two buckled straps instead.
 */
import { C, fill, ink, L, path, piece, Q, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { buckle, eyestay, footSole, GROUND, mouthLens, smooth, splineSegs } from "../parts-feet";

const X0 = 22;
const X1 = 186;

function last() {
  const s = footSole({ x0: X0, x1: X1, depth: 6, spring: 4, heel: 9, heelLen: 38, welt: true });
  const heelTop: Pt = [36, 59];
  const dip: Pt = [60, 70];
  const throat: Pt = [84, 59];
  const vamp: Pt = [128, 79];
  const outline: Pt[] = [
    [X0, GROUND], [18.5, 102], [18, 86], [21, 72], [28, 62], heelTop, [48, 64], dip, [72, 66], throat,
    [98, 65.5], [114, 72.5], vamp, [146, 84.5], [162, 90.5], [174, 97], [181.5, 104], [185.5, 109.5], s.toe,
  ];
  const upper = path(outline[0], [...splineSegs(outline), ...s.topBack], true);
  const counter = smooth([[42, 61.5], [38, 80], [37, 100], [38, GROUND]]);
  // The mouth: the opening seen a touch from above, the family's lens.
  const mouth = mouthLens([[29, 63], heelTop, [48, 64], dip, [72, 66], throat], 5);
  // The quarter's front edge, from the throat down to the welt.
  const quarter = smooth([[86, 68], [85, 88], [87, 106], [89, GROUND]]);
  return { s, upper, counter, mouth, quarter, throat, vamp };
}

function oxford(): KitPiece {
  const l = last();
  // Closed lacing: a slim facing whose lower edge meets the vamp's edge in a V.
  const stay = eyestay(l.throat, l.vamp, 7, 5, 0, 0.12, 0.88);
  const facing = path(l.throat, [Q([106, 66], l.vamp), Q([106, 73], stay.a2)], true);
  // Cap toe: a straight seam across the toe.
  const cap = smooth([[158, 89.5], [156.5, 100], [156, 108], [156, GROUND]]);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      shade(facing, 0.08),
      ink(stroke(l.upper), stroke(stay.top), stroke(path(stay.a2, [Q([106, 73], l.vamp)])), ...stay.bars, seam(cap), seam(l.quarter), seam(l.counter)),
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

function derby(): KitPiece {
  const l = last();
  // Open lacing: the quarters lie on the vamp as a flap whose front edge curls free.
  const flap = path([86, 66], [C([102, 74], [118, 84], [130, 90]), Q([138, 92], [136, 83])]);
  const stay = eyestay([88, 61], [126, 79], 9, 5, 0, 0.1, 0.9);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      ink(stroke(l.upper), stroke(flap), ...stay.bars, seam(l.quarter), seam(l.counter)),
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

function monk(): KitPiece {
  const l = last();
  // The quarter runs forward as a flap over the instep; two straps buckle on the side.
  const flapEdge = smooth([[122, 76], [126, 90], [120, 106], [114, GROUND]]);
  const strap = (x: number, y: number, len: number) => path([x, y], [L([x + len, y - 0.5]), L([x + len, y + 5.5]), L([x, y + 7])], true);
  const b1 = buckle(143, 85, 7.5, 9);
  const b2 = buckle(138, 99.5, 7.5, 9);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      ink(stroke(l.upper), stroke(flapEdge), stroke(strap(123, 82, 17)), stroke(strap(119, 96.5, 16)), seam(l.quarter), seam(l.counter)),
      b1.fills,
      b1.lines,
      b2.fills,
      b2.lines,
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

export const DRESS_SHOES: Record<string, KitPiece> = {
  "dress-shoes~oxford": oxford(),
  "dress-shoes~derby": derby(),
  "dress-shoes~monk": monk(),
};
DRESS_SHOES["dress-shoes"] = DRESS_SHOES["dress-shoes~oxford"];
