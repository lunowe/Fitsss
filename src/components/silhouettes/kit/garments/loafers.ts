/**
 * Loafers, side view, toe right, seen the family's touch from above: a low,
 * hollow slip-on. The foot opening is set well back and shows as a dark
 * cavity between the far topline (the silhouette's edge) and the near one;
 * the vamp rises to the instep in front of it and falls in one long line to
 * a blunt moc toe. The moc seam is a raised ridge that runs from the throat
 * along the side of the vamp and round the toe; the variant's hardware sits
 * on the instep between the opening and that seam (a penny saddle with its
 * keyhole, a tassel on a lace round the mouth, a horsebit). A thin welted
 * sole with a stacked heel block.
 */
import { C, fill, FILL2, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { footSole, GROUND, METAL, mouthOpening, offsetPoints, ring, smooth, splineSegs } from "../parts-feet";

const X0 = 20;
const X1 = 185;

function last() {
  const s = footSole({ x0: X0, x1: X1, depth: 4.5, spring: 4, heel: 10, heelLen: 34, welt: true });
  // The heel counter rises a little above the quarters; the far topline dips
  // towards the throat, its lowest point, where the vamp's back edge rises
  // steeply to the instep. The vamp then falls in one long line to a blunt toe.
  const topline: Pt[] = [[23, 79.4], [32, 78.4], [46, 79], [60, 80.2], [72, 80.6], [79, 79.6]];
  const outline: Pt[] = [
    [X0, GROUND], [17.4, 110], [16.4, 100], [16.8, 90], [18.6, 83.2], ...topline,
    [85, 76], [93, 72.6], [104, 71.4], [118, 71.8], [132, 73.4], [146, 76], [158, 80.2], [167, 85], [174, 90.6], [179, 96.8], [182.4, 103.2], [184.4, 109], s.toe,
  ];
  const upper = path(outline[0], [...splineSegs(outline), ...s.topBack], true);
  // The opening: deep enough to read as a hollow, its near edge inked.
  const mouth = mouthOpening(topline, 9);
  // The moc seam: the apron's edge on top of the vamp, from the throat a few
  // units under the vamp's line, round the blunt toe and down its front; a
  // raised ridge drawn as the seam, its stitching just above and a sliver of
  // shadow under it.
  const mocPts: Pt[] = [[83, 81.6], [100, 78.9], [122, 79.2], [144, 82.2], [159, 87.6], [170.4, 95.6], [177, 104.6], [179.4, 114.4]];
  const moc = smooth(mocPts);
  const under = offsetPoints(mocPts, 2);
  const ridge = path(mocPts[0], [...splineSegs(mocPts), L(under[under.length - 1]), ...splineSegs([...under].reverse())], true);
  const stitch = seam(smooth(offsetPoints(mocPts, -2).slice(1, -1)));
  // Stacked heel: the block's leather lifts as two seams across it.
  const yBot = GROUND + 4.5;
  const lifts = [3.4, 6.8].map((dy) => seam(polyline([X0 - 1.6, yBot + dy], [X0 + 33.4, yBot + dy])));
  return { s, upper, mouth, moc, ridge, stitch, lifts };
}

/** The common drawing of a loafer, with the hardware's fills and ink laid over the vamp. */
function loafer(hardware: { fills?: string[]; ink?: string[]; over?: string[] }): KitPiece {
  const l = last();
  return piece({
    base: [fill(l.upper)],
    lines: [
      l.s.fills,
      l.mouth.shade,
      shade(l.ridge, 0.12),
      ...(hardware.fills ?? []),
      ink(stroke(l.upper), stroke(l.mouth.rim), stroke(l.moc), l.stitch, ...l.lifts, ...(hardware.ink ?? [])),
      ...(hardware.over ?? []),
      l.s.lines,
    ],
    clip: l.upper,
    extent: [l.upper, l.s.path],
  });
}

/**
 * The penny saddle: a band across the instep from the top of the vamp down
 * to the moc seam, where its end is sewn in, stitched along both edges, with
 * its keyhole slot on top, and a sliver of shadow cast forward on the vamp.
 */
function penny(): KitPiece {
  // The saddle crosses the instep just in front of the opening and runs down
  // the side to the welt, square to the vamp's line, its end a stitched roll;
  // it stands a little proud of the vamp, so its top rides just above the
  // vamp's line and it covers the moc seam. The keyhole is cut on top, dark
  // like the opening.
  const band = path([92, 73.2], [
    Q([102, 69.6], [112, 71.4]),
    C([112.2, 84], [111.6, 98], [110.8, 111]),
    Q([102, 114.4], [93.2, 111]),
    C([92.4, 98], [91.6, 84], [92, 73.2]),
  ], true);
  const roll = seam(path([93.4, 106.4], [Q([102, 109.4], [110.8, 106.4])]));
  const stitchBack = seam(path([95, 74.6], [C([94.8, 86], [95.2, 96], [95.8, 104.6])]));
  const stitchFront = seam(path([109.2, 72.8], [C([109.2, 86], [108.8, 96], [108.4, 104.6])]));
  const slot = path([95.4, 77.2], [Q([102, 71.8], [108.8, 76.4]), Q([102.2, 82.4], [95.4, 77.2])], true);
  return loafer({
    over: [fill(band), shade(band, 0.12), shade(slot, 0.55), ink(stroke(band), stroke(slot), stitchBack, stitchFront, roll)],
  });
}

function tassel(): KitPiece {
  // A leather lace runs along the near topline round the mouth and ties on
  // the instep; the tassel hangs from the knot over the vamp.
  const lace = smooth([[30, 80.5], [44, 86.8], [58, 88.6], [72, 85.4], [84, 79.6], [94, 75.4], [101, 74]]);
  const body = path([97, 78], [L([105, 78]), L([107.5, 94]), Q([102, 96.6], [96, 94])], true);
  const fringe = [99, 101.8, 104.6].map((x) => seam(polyline([x, 83.5], [x + (x - 101.8) * 0.2, 94])));
  return loafer({
    fills: [fill(body), shade(body, 0.1)],
    ink: [stroke(lace), stroke(body), ...fringe],
    over: [ring(101.5, 75.4, 2.8)],
  });
}

function horsebit(): KitPiece {
  // The bit: two rings joined by a bar, in metal, across the instep.
  const bar = path([93, 77.4], [L([110, 75.6]), L([110.6, 80.2]), L([93.6, 82])], true);
  return loafer({
    fills: [fill(bar, FILL2), shade(bar, METAL)],
    ink: [stroke(bar)],
    over: [ring(92.4, 80, 4), ring(111, 77.8, 4)],
  });
}

export const LOAFERS: Record<string, KitPiece> = {
  "loafers~penny": penny(),
  "loafers~tassel": tassel(),
  "loafers~horsebit": horsebit(),
};
LOAFERS["loafers"] = LOAFERS["loafers~penny"];
