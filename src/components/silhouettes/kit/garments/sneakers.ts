/**
 * Sneakers, side view with the toe to the right. The low-top: a padded
 * collar, a laced eyestay over the tongue, toe cap, heel counter and a
 * two-part sole in the second color.
 */
import { C, FILL2, fill, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";

/** y where the upper meets the sole. */
export const SOLE_Y = 118;

/** The midsole and outsole under an upper that spans `x0..x1` at `SOLE_Y`. */
export function sole(x0: number, x1: number, depth = 13): { fills: string; lines: string; path: string } {
  const y1 = SOLE_Y + depth;
  const d = path([x0, SOLE_Y], [
    L([x1, SOLE_Y]),
    // toe: the sole wraps up a little and springs off the ground
    C([x1 + 4, SOLE_Y + 1], [x1 + 4, y1 - 4], [x1 - 3, y1 - 1.5]),
    L([x0 + 5, y1 + 0.5]),
    C([x0 - 2, y1 + 0.5], [x0 - 2, SOLE_Y + 2], [x0, SOLE_Y]),
  ], true);
  const foxing = polyline([x0 + 4, SOLE_Y + 3.5], [x1 - 1, SOLE_Y + 3.5]);
  // Outsole: the bottom of the sole, a shade darker.
  const outsole = path([x0 - 1, y1 - 4], [L([x1 + 1, y1 - 4.5]), C([x1 + 1, y1 - 3], [x1, y1 - 1.5], [x1 - 3, y1 - 1.5]), L([x0 + 5, y1 + 0.5]), C([x0 + 1, y1 + 0.5], [x0 - 1, y1 - 1], [x0 - 1, y1 - 4])], true);
  return {
    fills: fill(d, FILL2) + shade(outsole, 0.18),
    lines: ink(stroke(d), seam(foxing), seam(path([x0 - 1, y1 - 4], [L([x1 + 1, y1 - 4.5])]))),
    path: d,
  };
}

function lowTop(): KitPiece {
  const heelTop: Pt = [24, 60];
  const throat: Pt = [76, 70];
  const tongueBack: Pt = [82, 56];
  const tongueFront: Pt = [104, 52];
  const upper = path(heelTop, [
    // topline: a padded collar dipping from the heel to the throat
    C([40, 58], [60, 63], throat),
    // the tongue stands up out of the throat as a rounded tab
    C([78, 64], [78, 58], tongueBack),
    C([88, 50], [98, 49], tongueFront),
    // the lacing slopes down the vamp; the toe box stays full and rounds off
    C([118, 60], [132, 70], [146, 78]),
    C([164, 82], [178, 86], [185, 93]),
    C([190, 99], [190, 111], [185, SOLE_Y]),
    L([16, SOLE_Y]),
    // around the heel
    C([9, 110], [11, 72], heelTop),
  ], true);
  // Eyestay: the lace panel along the top of the vamp.
  const stayBottom = path([90, 68], [Q([116, 74], [148, 89])]);
  const laces: string[] = [];
  for (let i = 0; i < 5; i++) {
    const t = 0.1 + i * 0.2;
    const x = 96 + (142 - 96) * t;
    const y = 56 + (77 - 56) * t;
    laces.push(stroke(polyline([x + 1.2, y + 1], [x - 2.8, y + 9.5])));
  }
  const heelTab = path([21, 53], [L([30, 52]), L([31, 60]), L([22, 62])], true);
  const collar = path([30, 65], [C([44, 63], [60, 67], [74, 76])]);
  const heelCounter = path([42, 61], [C([34, 82], [36, 104], [40, SOLE_Y])]);
  const quarter = path([86, 74], [C([91, 90], [95, 106], [97, SOLE_Y])]);
  const toeCap = path([152, SOLE_Y], [C([152, 104], [156, 92], [164, 85])]);
  const s = sole(16, 187, 14);
  // Colorblock: toe cap and heel counter.
  const toePanel = path([152, SOLE_Y], [C([152, 104], [156, 92], [164, 85]), C([174, 87], [180, 89], [185, 93]), C([190, 99], [190, 111], [185, SOLE_Y])], true);
  const heelPanel = path([16, SOLE_Y], [C([9, 110], [11, 72], heelTop), L([42, 61]), C([34, 82], [36, 104], [40, SOLE_Y])], true);
  // Inside of the collar, behind the tongue.
  const collarInside = path(throat, [C([78, 64], [78, 58], tongueBack), Q([80, 66], throat)], true);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      shade(collarInside, 0.3),
      fill(heelTab, FILL2),
      ink(
        stroke(upper),
        stroke(heelTab),
        seam(collar),
        seam(heelCounter),
        seam(quarter),
        seam(toeCap),
        stroke(stayBottom),
        ...laces,
      ),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: toePanel + heelPanel,
  });
}

export const SNEAKERS: Record<string, KitPiece> = {
  "sneakers~low-top": lowTop(),
};

