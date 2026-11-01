/**
 * Loafers, side view, toe right: a low-cut slip-on with a moc apron along
 * the vamp on a thin leather sole with a low heel. The vamp carries the
 * variant's hardware: a penny saddle with its slot, a tassel on a lace, a
 * horsebit on a strap.
 */
import { C, fill, FILL2, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { footSole, GROUND, METAL, ring } from "../parts-feet";

const X0 = 22;
const X1 = 184;

function last() {
  const s = footSole({ x0: X0, x1: X1, depth: 6, spring: 4, heel: 7, heelLen: 36, welt: true });
  const heelTop: Pt = [31, 66];
  const throat: Pt = [70, 80];
  const instep: Pt = [98, 69];
  const upper = path([X0, GROUND], [
    C([13, 110], [16, 78], heelTop),
    C([46, 62], [58, 74], throat),
    C([78, 78], [86, 70], instep),
    C([124, 71], [150, 80], [170, 90]),
    C([180, 95], [186, 102], [185.5, 108]),
    Q([185, 113], s.toe),
    ...s.topBack,
  ], true);
  // Moc apron: the seam along the vamp's crown, and the quarter seam at the throat.
  const apron = path([76, 84], [C([90, 78], [124, 78], [160, 90]), C([170, 93], [176, 98], [178, 104])]);
  const quarter = path([72, 82], [C([78, 94], [80, 108], [82, GROUND])]);
  const counter = path([44, 64], [C([36, 80], [36, 100], [40, GROUND])]);
  // The mouth: the inside of the shoe seen over the low topline.
  const mouth = shade(path([34, 67], [C([46, 63], [58, 74], [69, 80]), Q([54, 74], [40, 70])], true), 0.28);
  return { s, upper, apron, quarter, counter, mouth };
}

function penny(): KitPiece {
  const l = last();
  // Saddle strap across the vamp, with its slot on the crown.
  const saddle = path([99, 69.5], [C([100, 86], [102, 102], [103, GROUND]), L([118, GROUND]), C([117, 102], [116, 86], [116, 70])], true);
  const slot = path([104, 74.5], [L([112, 74]), L([110, 78]), L([105, 78.5])], true);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      ink(stroke(l.upper), stroke(saddle), seam(l.apron), seam(l.quarter), seam(l.counter)),
      shade(slot, 0.4),
      ink(stroke(slot)),
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

function tassel(): KitPiece {
  const l = last();
  // A leather lace runs along the mouth, knotted on the vamp; the tassel hangs from it.
  const lace = path([36, 70], [C([48, 66], [60, 76], [74, 84]), C([82, 80], [92, 76], [104, 76])]);
  const knot = ring(104, 76, 2.4);
  const body = path([101, 78], [L([107, 78]), L([109, 90]), Q([104, 92], [99, 90])], true);
  const fringe = [101.5, 104, 106.5].map((x) => seam(polyline([x, 82], [x + (x - 104) * 0.15, 90])));
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      fill(body, FILL2),
      ink(stroke(l.upper), seam(l.apron), seam(l.quarter), seam(l.counter), stroke(lace), stroke(body), ...fringe),
      knot,
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

function horsebit(): KitPiece {
  const l = last();
  const strap = path([97, 69.5], [C([98, 86], [100, 102], [101, GROUND]), L([120, GROUND]), C([119, 102], [118, 86], [118, 70])], true);
  // The bit: two rings joined by a bar, in metal.
  const bar = path([102, 75], [L([114, 74]), L([114, 78]), L([102, 79])], true);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      ink(stroke(l.upper), stroke(strap), seam(l.apron), seam(l.quarter), seam(l.counter)),
      shade(bar, METAL),
      ink(stroke(bar)),
      ring(101.5, 77, 3.2),
      ring(114.5, 76, 3.2),
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

export const LOAFERS: Record<string, KitPiece> = {
  "loafers~penny": penny(),
  "loafers~tassel": tassel(),
  "loafers~horsebit": horsebit(),
};
LOAFERS["loafers"] = LOAFERS["loafers~penny"];
