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
  // A taller vamp: the instep crowns high over the foot and the throat
  // sits well up the heel, so the shoe reads as a loafer, not a slipper.
  const heelTop: Pt = [36, 56];
  const throat: Pt = [74, 68];
  const instep: Pt = [100, 57];
  const outline: Pt[] = [
    [X0, GROUND], [18.5, 102], [18, 86], [21, 70], [28, 59], heelTop, [48, 60], [62, 65], throat,
    [86, 61], instep, [116, 57.5], [132, 63], [148, 72], [162, 82.5], [172, 92], [179, 101], [183.5, 108], s.toe,
  ];
  const upper = path(outline[0], [...splineSegs(outline), ...s.topBack], true);
  // Moc apron: the raised plug on the vamp, its seam running from the throat
  // along the crown and curling down round the toe, with the apron's gathered
  // edge as a second line just outside it.
  const apronPts: Pt[] = [[78, 76], [90, 69], [104, 65.5], [120, 65.5], [136, 70], [150, 77.5], [162, 87], [170, 96], [174, 106]];
  const apron = smooth(apronPts);
  const apronEdge = smooth(apronPts.slice(1).map(([x, y]): Pt => [x + 1.5, y + 4]));
  const counter = smooth([[42, 58.5], [38, 78], [37, 100], [38, GROUND]]);
  // The mouth: the inside of the shoe seen over the low topline.
  const mouthPts = outline.slice(5, 9);
  const mouth = shade(path(mouthPts[0], [...splineSegs(mouthPts), C([62, 68], [46, 63], mouthPts[0])], true), 0.28);
  return { s, upper, apron, apronEdge, counter, mouth, instep };
}

function penny(): KitPiece {
  const l = last();
  // The saddle: a bold strap across the instep from welt to welt, with its
  // keyhole slot cut on the crown.
  const saddle = path([96, 57.8], [C([98, 78], [100, 100], [101, GROUND]), L([124, GROUND]), C([122, 100], [120, 78], [118, 57.5]), Q([107, 55.5], [96, 57.8])], true);
  const slot = path([102, 63.5], [L([113, 63]), L([114.5, 68.5]), L([109, 71]), L([103.5, 70])], true);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      shade(saddle, 0.08),
      ink(stroke(l.upper), stroke(l.apron), seam(l.apronEdge), seam(l.counter), stroke(saddle)),
      shade(slot, 0.42),
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
  const lace = smooth([[40, 60], [52, 62], [64, 67], [76, 72], [88, 69], [100, 66]]);
  const knot = ring(101, 66, 2.6);
  const body = path([97, 68.5], [L([105, 68.5]), L([107.5, 84]), Q([102, 86.5], [96, 84])], true);
  const fringe = [98.5, 101.5, 104.5].map((x) => seam(polyline([x, 73], [x + (x - 101.5) * 0.2, 84])));
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      fill(body, FILL2),
      ink(stroke(l.upper), stroke(l.apron), seam(l.apronEdge), seam(l.counter), stroke(lace), stroke(body), ...fringe),
      knot,
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

function horsebit(): KitPiece {
  const l = last();
  const strap = path([95, 58], [C([97, 78], [99, 102], [100, GROUND]), L([124, GROUND]), C([122, 100], [120, 78], [118, 57.5]), Q([107, 55.5], [95, 58])], true);
  // The bit: two rings joined by a bar, in metal.
  const bar = path([101, 64.5], [L([116, 63.5]), L([116, 68]), L([101, 69])], true);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      shade(strap, 0.08),
      ink(stroke(l.upper), stroke(strap), stroke(l.apron), seam(l.apronEdge), seam(l.counter)),
      fill(bar, FILL2),
      shade(bar, METAL),
      ink(stroke(bar)),
      ring(100.5, 66.7, 3.6),
      ring(116.5, 65.7, 3.6),
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
