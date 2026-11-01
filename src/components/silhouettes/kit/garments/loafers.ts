/**
 * Loafers, side view, toe right: a low-cut slip-on whose vamp rises to a
 * high instep, with a moc apron along the vamp, on a thin welted leather
 * sole with a stacked heel. The instep carries the variant's hardware: a
 * penny saddle with its slot, a tassel on a lace, a horsebit on a strap.
 */
import { C, fill, FILL2, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { footSole, GROUND, METAL, ring, smooth, splineSegs } from "../parts-feet";

const X0 = 22;
const X1 = 184;

function last() {
  const s = footSole({ x0: X0, x1: X1, depth: 6, spring: 4, heel: 8, heelLen: 36, welt: true });
  const heelTop: Pt = [36, 60];
  const throat: Pt = [72, 75];
  const instep: Pt = [98, 62.5];
  const outline: Pt[] = [
    [X0, GROUND], [18.5, 102], [18, 86], [21, 72], [28, 63], heelTop, [48, 63.5], [60, 70], throat,
    [84, 67.5], instep, [112, 63], [128, 67.5], [144, 75], [158, 84], [169, 93], [177.5, 101], [182.5, 107.5], s.toe,
  ];
  const upper = path(outline[0], [...splineSegs(outline), ...s.topBack], true);
  // Moc apron: the seam along the vamp's crown, curling down around the toe.
  const apron = smooth([[76, 81], [88, 74.5], [100, 70], [114, 70], [128, 74], [142, 80.5], [156, 89], [166, 98], [170, 106]]);
  const counter = smooth([[42, 62.5], [38, 80], [37, 100], [38, GROUND]]);
  // The mouth: the inside of the shoe seen over the low topline.
  const mouthPts = outline.slice(5, 9);
  const mouth = shade(path(mouthPts[0], [...splineSegs(mouthPts), C([60, 72], [46, 67], mouthPts[0])], true), 0.28);
  return { s, upper, apron, counter, mouth, instep };
}

function penny(): KitPiece {
  const l = last();
  // Saddle strap across the instep, down to the sole, with its slot on the crown.
  const saddle = path([97, 63.3], [C([98.5, 82], [100, 102], [101, GROUND]), L([120, GROUND]), C([118.5, 102], [116.5, 82], [115, 63]), Q([106, 61.5], [97, 63.3])], true);
  const slot = path([103, 67.5], [L([112, 67]), L([110.5, 71]), L([104.5, 71.5])], true);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      ink(stroke(l.upper), stroke(saddle), seam(l.apron), seam(l.counter)),
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
  const lace = smooth([[40, 64], [52, 66], [64, 72], [76, 78], [88, 74], [100, 71]]);
  const knot = ring(101, 71, 2.6);
  const body = path([97, 73.5], [L([105, 73.5]), L([107.5, 88]), Q([102, 90.5], [96, 88])], true);
  const fringe = [98.5, 101.5, 104.5].map((x) => seam(polyline([x, 78], [x + (x - 101.5) * 0.2, 88])));
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      fill(body, FILL2),
      ink(stroke(l.upper), seam(l.apron), seam(l.counter), stroke(lace), stroke(body), ...fringe),
      knot,
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

function horsebit(): KitPiece {
  const l = last();
  const strap = path([95, 63.5], [C([96.5, 82], [98, 102], [99, GROUND]), L([122, GROUND]), C([120.5, 102], [118.5, 82], [117, 63.5]), Q([106, 61.5], [95, 63.5])], true);
  // The bit: two rings joined by a bar, in metal.
  const bar = path([101, 70], [L([116, 69]), L([116, 73.5]), L([101, 74.5])], true);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      ink(stroke(l.upper), stroke(strap), seam(l.apron), seam(l.counter)),
      fill(bar, FILL2),
      shade(bar, METAL),
      ink(stroke(bar)),
      ring(100.5, 72.2, 3.6),
      ring(116.5, 71.2, 3.6),
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
