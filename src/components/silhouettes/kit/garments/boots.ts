/**
 * Boots, side view, toe right, on the family's leather sole with a welt and a
 * heel block. Each variant is its real self: a chelsea's elastic gusset and
 * pull tab, a lace-up's laced front, a work boot's moc toe and wedge sole, a
 * hiking boot's padded collar, lugs and toe rand, a western's tall shaft,
 * underslung heel and pull straps.
 */
import { C, FILL2, fill, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt, type Seg } from "../draw";
import type { KitPiece } from "../types";
import { eyelet, footSole, GROUND, laceBars, roundRect } from "../parts-feet";

/** The boot toe: a full, round toe from the instep to the tip. */
function bootToe(vamp: Pt, tip: Pt, height: number, pointed = 0): Seg[] {
  const crown: Pt = [tip[0] - 16 - pointed * 6, tip[1] - height];
  return [
    C([vamp[0] + 20, vamp[1] + 2], [crown[0] - 18, crown[1] - 2], crown),
    C([crown[0] + 10 + pointed * 4, crown[1] + 1], [tip[0] + 2, tip[1] - height * 0.55], [tip[0] + 1.5, tip[1] - 8]),
    Q([tip[0] + 1, tip[1] - 2], tip),
  ];
}

/** A back seam from the shaft top down the heel. */
const backSeam = (x: number, y0: number, y1: number) => path([x, y0], [C([x - 1, y0 + (y1 - y0) * 0.4], [x - 2.5, y1 - 10], [x - 2, y1])]);

function chelsea(): KitPiece {
  const s = footSole({ x0: 20, x1: 184, depth: 7, spring: 4, heel: 8, heelLen: 40, welt: true });
  const topBack: Pt = [27, 34];
  const topFront: Pt = [72, 33];
  const vamp: Pt = [106, 78];
  const upper = path([20, GROUND], [
    C([11, 108], [14, 70], [18, 52]),
    C([20, 44], [22, 37], topBack),
    Q([50, 30], topFront),
    C([75, 52], [84, 70], vamp),
    ...bootToe(vamp, s.toe, 26),
    ...s.topBack,
  ], true);
  // Elastic gusset: a tapered insert with vertical ribs, in the second color.
  const gusset = path([44, 32.5], [L([68, 32.6]), C([67, 56], [64, 68], [60, 74]), Q([54, 78], [48, 74]), C([46, 68], [45, 56], [44, 32.5])], true);
  const ribs = [49.5, 54.5, 59.5, 64].map((x, i) => seam(polyline([x + (i - 1.5) * 0.3, 35], [x - (i - 1.5) * 0.9, 72 - Math.abs(i - 1.5) * 1.5])));
  const tab = roundRect(21, 24, 8, 14, 3.2);
  const vampSeam = path([62, 72], [C([72, 84], [80, 100], [84, GROUND])]);
  return piece({
    base: [fill(upper)],
    lines: [
      fill(tab, FILL2),
      s.fills,
      fill(gusset, FILL2),
      shade(gusset, 0.1),
      ink(stroke(tab), stroke(upper), stroke(gusset), ...ribs, seam(vampSeam), seam(backSeam(26, 40, GROUND))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path, tab],
  });
}

function laceUp(): KitPiece {
  const s = footSole({ x0: 20, x1: 184, depth: 8, spring: 4, heel: 9, heelLen: 40, welt: true });
  const topBack: Pt = [26, 36];
  const topFront: Pt = [60, 34];
  const tongueBack: Pt = [80, 26];
  const tongueFront: Pt = [89, 34];
  const vamp: Pt = [113, 80];
  const upper = path([20, GROUND], [
    C([11, 108], [14, 70], [18, 54]),
    C([20, 46], [22, 39], topBack),
    Q([44, 31], topFront),
    C([63, 26], [72, 24], tongueBack),
    Q([88, 28], tongueFront),
    C([93, 52], [100, 70], vamp),
    ...bootToe(vamp, s.toe, 26),
    ...s.topBack,
  ], true);
  // The facing: its inner edge runs parallel to the front, laces bar across it.
  const stayBottom = path([68, 40], [C([74, 56], [84, 74], [104, 86])]);
  const laces = laceBars([89, 36], [112, 79], [69, 41], [104, 86], 6);
  const quarter = path([108, 86], [C([112, 98], [114, 108], [114, GROUND])]);
  const tongueShade = shade(path(topFront, [C([63, 26], [72, 24], tongueBack), Q([74, 34], topFront)], true), 0.3);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      tongueShade,
      ink(stroke(upper), stroke(stayBottom), ...laces, seam(quarter), seam(backSeam(25, 42, GROUND))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
  });
}

function work(): KitPiece {
  const s = footSole({ x0: 20, x1: 184, depth: 15, spring: 5, heelLift: 4, welt: true });
  const topBack: Pt = [26, 42];
  const topFront: Pt = [60, 40];
  const tongueBack: Pt = [80, 32];
  const tongueFront: Pt = [89, 40];
  const vamp: Pt = [112, 82];
  const upper = path([20, GROUND], [
    C([11, 108], [14, 72], [18, 58]),
    C([20, 50], [22, 45], topBack),
    Q([44, 37], topFront),
    C([63, 32], [72, 30], tongueBack),
    Q([88, 34], tongueFront),
    C([93, 56], [100, 72], vamp),
    ...bootToe(vamp, s.toe, 26),
    ...s.topBack,
  ], true);
  const stayBottom = path([68, 46], [C([74, 60], [84, 76], [104, 88])]);
  const laces = laceBars([89, 42], [111, 81], [69, 47], [104, 88], 6);
  // Moc toe: the apron seam runs forward along the toe's crown and curls down at the tip.
  const moc = path([110, 88], [C([132, 86], [156, 88], [170, 96]), C([176, 100], [179, 105], [178, 110])]);
  const moc2 = path([112, 92], [C([134, 90], [156, 92], [168, 99])]);
  const collar = path([30, 46], [Q([44, 41], [58, 44])]);
  const tongueShade = shade(path(topFront, [C([63, 32], [72, 30], tongueBack), Q([74, 40], topFront)], true), 0.3);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      tongueShade,
      ink(stroke(upper), stroke(stayBottom), ...laces, seam(moc), seam(moc2), seam(collar), seam(backSeam(25, 48, GROUND))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
  });
}

function hiking(): KitPiece {
  const s = footSole({ x0: 19, x1: 185, depth: 13, spring: 6, heelLift: 3, lugs: true, ball: 48 });
  const heelTop: Pt = [26, 40];
  const dip: Pt = [50, 45];
  const topFront: Pt = [62, 40];
  const tongueBack: Pt = [80, 30];
  const tongueFront: Pt = [90, 38];
  const vamp: Pt = [116, 82];
  const upper = path([19, GROUND], [
    C([10, 108], [12, 72], [16, 58]),
    C([18, 48], [20, 42], heelTop),
    C([34, 36], [44, 44], dip),
    Q([56, 44], topFront),
    C([65, 30], [72, 28], tongueBack),
    Q([89, 32], tongueFront),
    C([95, 56], [104, 72], vamp),
    ...bootToe(vamp, s.toe, 25),
    ...s.topBack,
  ], true);
  const stayBottom = path([70, 44], [C([76, 60], [88, 76], [108, 88])]);
  const laces = laceBars([90, 40], [115, 81], [71, 45], [108, 88], 6);
  const hooks = [[83, 41], [92, 55]].map(([x, y]) => eyelet([x, y], 1.6));
  // Padded collar and a heel counter.
  const collar = path([22, 48], [C([32, 42], [44, 48], [52, 50]), Q([58, 50], [62, 46])]);
  const counter = path([44, 58], [C([36, 76], [36, 100], [42, GROUND])]);
  // Rubber rand around the toe, in the second color.
  const randTop: Pt = [146, 96];
  const rand = path([140, GROUND], [
    C([141, 106], [142, 100], randTop),
    C([160, 98], [176, 102], [184, 108]),
    Q([186, 112], s.toe),
    Q([176, GROUND], [140, GROUND]),
  ], true);
  const quarter = path([110, 88], [C([116, 98], [120, 106], [122, GROUND])]);
  const tongueShade = shade(path(topFront, [C([65, 30], [72, 28], tongueBack), Q([74, 40], topFront)], true), 0.3);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      tongueShade,
      fill(rand, FILL2),
      ink(stroke(upper), stroke(rand), stroke(stayBottom), ...laces, seam(collar), seam(counter), seam(quarter)),
      ...hooks,
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
  });
}

function western(): KitPiece {
  const s = footSole({ x0: 22, x1: 187, depth: 6, spring: 5, heel: 15, heelLen: 36, heelSlant: 6, welt: true });
  const topBack: Pt = [34, 12];
  const topFront: Pt = [66, 14];
  const vamp: Pt = [88, 76];
  const upper = path([22, GROUND], [
    C([13, 108], [20, 70], [24, 50]),
    C([26, 34], [30, 22], topBack),
    C([40, 9], [58, 9], topFront),
    C([70, 40], [72, 62], vamp),
    C([118, 78], [150, 82], [172, 90]),
    C([184, 95], [189, 101], [188, 108]),
    Q([187.5, 113], s.toe),
    ...s.topBack,
  ], true);
  // Pull strap on the side of the shaft top, and the stitched shaft motif.
  const strap = roundRect(46, 5, 8, 16, 3.5);
  const arch = (dx: number, dy: number) => path([38 + dx, 74 - dy], [C([38 + dx, 48 - dy * 0.4], [46 + dx * 0.4, 30 + dy], [50, 24 + dy]), C([54 - dx * 0.4, 30 + dy], [62 - dx, 48 - dy * 0.4], [62 - dx, 74 - dy])]);
  // The vamp seam: a V across the instep, then down to the welt.
  const vampSeam = path([70, 60], [C([78, 68], [86, 76], [94, 82]), C([98, 96], [100, 108], [101, GROUND])]);
  return piece({
    base: [fill(upper)],
    lines: [
      fill(strap, FILL2),
      s.fills,
      ink(stroke(strap), stroke(upper), seam(arch(0, 0)), seam(arch(4, 4)), seam(vampSeam), seam(backSeam(32, 18, GROUND))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path, strap],
  });
}

export const BOOTS: Record<string, KitPiece> = {
  "boots~chelsea": chelsea(),
  "boots~lace-up": laceUp(),
  "boots~work": work(),
  "boots~hiking": hiking(),
  "boots~western": western(),
};
BOOTS["boots"] = BOOTS["boots~chelsea"];
