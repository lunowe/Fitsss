/**
 * Loafers, side view, toe right: a low-cut slip-on with a high instep. The
 * quarter's topline dips behind the vamp, the vamp rises to a crown at the
 * instep and falls in one long line to a rounded toe; the moc apron runs
 * forward from the instep along the side of the toe. The instep carries the
 * variant's hardware: a penny saddle descending the side of the shoe with
 * its slot on the crown, a tassel on a lace round the mouth, a horsebit on a
 * strap. A thin welted sole with a low stacked heel, and the opening shown as
 * the family's dark lens.
 */
import { C, fill, FILL2, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { footSole, GROUND, METAL, mouthLens, ring, smooth, splineSegs } from "../parts-feet";

const X0 = 22;
const X1 = 184;

function last() {
  const s = footSole({ x0: X0, x1: X1, depth: 6, spring: 4, heel: 8, heelLen: 36, welt: true });
  const heelTop: Pt = [36, 68];
  const dip: Pt = [60, 73];
  const throat: Pt = [72, 70];
  const crown: Pt = [100, 63];
  const outline: Pt[] = [
    [X0, GROUND], [18.5, 106], [18, 92], [21, 80], [28, 71.5], heelTop, [48, 71], dip, throat, [85, 65.5], crown,
    [118, 63.5], [136, 66.5], [152, 72.5], [165, 80.5], [174, 89.5], [180, 99], [183.5, 107.5], s.toe,
  ];
  const upper = path(outline[0], [...splineSegs(outline), ...s.topBack], true);
  // Moc apron: the plug's seam from the strap forward along the side of the toe and down round the tip.
  const apron = smooth([[110, 69.5], [126, 70.5], [142, 74.5], [156, 81], [166, 89], [173, 98], [177, 106.5]]);
  const counter = smooth([[40, 70], [38, 84], [37, 101], [38, GROUND]]);
  // The mouth: the opening behind the vamp, seen a touch from above.
  const mouth = mouthLens([[29, 71], heelTop, [48, 71], dip, throat], 5);
  // The strap across the instep as seen from the side: its edges run from
  // the crown down to the welt, and it casts a sliver of shadow forward onto
  // the vamp, so it sits on the shoe instead of wrapping round it.
  const backTop: Pt = [88, 65];
  const frontTop: Pt = [108, 63];
  const back = path(backTop, [C([91, 82], [93, 100], [93.5, GROUND])]);
  const front = path(frontTop, [C([111, 82], [114, 100], [114.5, GROUND])]);
  const band = path(backTop, [C([91, 82], [93, 100], [93.5, GROUND]), L([114.5, GROUND]), C([114, 100], [111, 82], frontTop), Q([98, 61.8], backTop)], true);
  const cast = path(frontTop, [C([111, 82], [114, 100], [114.5, GROUND]), L([117.5, GROUND]), C([117, 100], [114, 82], [111, 63.5])], true);
  return { s, upper, apron, counter, mouth, strapEdges: [back, front], cast: shade(band, 0.08) + shade(cast, 0.16), crown };
}

function penny(): KitPiece {
  const l = last();
  // The keyhole slot on the crown, cut into the saddle: a dark diamond big enough for 96 px.
  const slot = path([92, 66], [L([104, 63.6]), L([106, 68]), L([99.5, 70.8]), L([93, 70])], true);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      l.cast,
      ink(stroke(l.upper), ...l.strapEdges.map((d) => stroke(d)), seam(l.apron), seam(l.counter)),
      shade(slot, 0.5),
      ink(stroke(slot)),
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

function tassel(): KitPiece {
  const l = last();
  // A leather lace runs round the mouth and ties on the instep; the tassel hangs from the knot.
  const lace = smooth([[40, 71.5], [52, 74.5], [64, 77], [76, 74], [88, 69], [97, 66.5]]);
  const knot = ring(98, 68.3, 2.6);
  const body = path([94, 71], [L([102, 71]), L([104.5, 87.5]), Q([99, 90], [93, 87.5])], true);
  const fringe = [95.5, 98.5, 101.5].map((x) => seam(polyline([x, 76.5], [x + (x - 98.5) * 0.2, 87.5])));
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      fill(body),
      shade(body, 0.1),
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
  // The bit: two rings joined by a bar, in metal, on the strap's crown.
  const bar = path([92.5, 68.3], [L([105.5, 65.8]), L([106, 70.3]), L([93, 72.8])], true);
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth,
      l.cast,
      ink(stroke(l.upper), ...l.strapEdges.map((d) => stroke(d)), seam(l.apron), seam(l.counter)),
      fill(bar, FILL2),
      shade(bar, METAL),
      ink(stroke(bar)),
      ring(92, 71, 3.6),
      ring(106, 68.3, 3.6),
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
