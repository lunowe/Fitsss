/**
 * Dress shoes, side view, toe right: a sleek last with a long vamp and an
 * almond toe on a thin welted sole with a heel. The oxford's closed lacing
 * is a narrow V facing stitched under the vamp with a cap toe; the derby's
 * open lacing is a free flap on top of a plain vamp; the monk has no laces,
 * two buckled straps instead.
 */
import { C, fill, ink, L, path, piece, Q, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { buckle, footSole, GROUND, laceBars } from "../parts-feet";

const X0 = 22;
const X1 = 186;

function last() {
  const s = footSole({ x0: X0, x1: X1, depth: 6, spring: 4, heel: 8, heelLen: 38, welt: true });
  const heelTop: Pt = [32, 62];
  const dip: Pt = [62, 72];
  const throat: Pt = [82, 60];
  const vamp: Pt = [132, 82];
  const upper = path([X0, GROUND], [
    C([13, 110], [16, 74], heelTop),
    C([44, 60], [54, 68], dip),
    C([68, 70], [75, 60], throat),
    C([94, 61], [116, 74], vamp),
    C([152, 86], [170, 90], [180, 95]),
    C([186, 99], [188, 105], [187, 110]),
    Q([186.5, 113], s.toe),
    ...s.topBack,
  ], true);
  const counter = path([44, 61], [C([36, 80], [36, 100], [40, GROUND])]);
  // The mouth: the inside of the shoe seen over the low topline.
  const mouth = shade(path([35, 63], [C([44, 61], [54, 69], [63, 73]), Q([50, 71], [40, 66])], true), 0.28);
  return { s, upper, counter, mouth, throat, vamp };
}

function oxford(): KitPiece {
  const l = last();
  // Closed lacing: the facing is a slim V whose edges meet at the vamp, under the vamp's edge.
  const stayBottom = path([84, 67], [C([100, 73], [116, 80], l.vamp)]);
  const laces = laceBars([86, 62], [126, 80], [86, 68], [126, 82.5], 5);
  // Cap toe: a straight seam across the toe.
  const cap = path([158, 87], [C([157, 98], [156, 108], [156, GROUND])]);
  const quarter = path([84, 68], [C([84, 90], [86, 106], [88, GROUND])]);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      ink(stroke(l.upper), stroke(stayBottom), ...laces, seam(cap), seam(quarter), seam(l.counter)),
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

function derby(): KitPiece {
  const l = last();
  // Open lacing: the quarters lie on the vamp as a flap whose front edge curls free.
  const flap = path([84, 67], [C([100, 76], [118, 86], [130, 92]), Q([138, 93], [136, 84])]);
  const laces = laceBars([88, 63], [124, 79], [88, 70], [124, 89], 5);
  const quarter = path([84, 68], [C([84, 90], [86, 106], [88, GROUND])]);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      ink(stroke(l.upper), stroke(flap), ...laces, seam(quarter), seam(l.counter)),
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

function monk(): KitPiece {
  const l = last();
  // The quarter runs forward as a flap over the instep; two straps buckle on the side.
  const flapEdge = path([122, 77], [C([126, 90], [120, 106], [114, GROUND])]);
  const strap = (x: number, y: number, len: number) => path([x, y], [L([x + len, y - 0.5]), L([x + len, y + 5]), L([x, y + 6.5])], true);
  const b1 = buckle(142, 85.5, 7, 8);
  const b2 = buckle(137, 99.5, 7, 8);
  const quarter = path([84, 68], [C([84, 90], [86, 106], [88, GROUND])]);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      ink(stroke(l.upper), stroke(flapEdge), stroke(strap(123, 83, 16)), stroke(strap(119, 97, 15)), seam(quarter), seam(l.counter)),
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
