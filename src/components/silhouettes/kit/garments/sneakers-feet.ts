/**
 * Sneakers, side view, toe right. One last for the family: the heel counter
 * rises to a padded collar, the topline runs forward and down to the throat,
 * the tongue stands up behind a laced eyestay whose lace line slopes to the
 * vamp, and a full toe box rounds over a sprung toe onto a two-part sole in
 * the second color. Variants change the profile, the sole and one signature
 * detail each, never the line.
 */
import { fill, FILL2, ink, L, lerp, path, piece, polyline, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { eyestay, footSole, GROUND, LACE_W, smooth, splineSegs, type Sole } from "../parts-feet";

/**
 * The upper's outline: a spline up the heel, over the collar and the tongue
 * (`back`, ending where the tongue's front edge meets the lace line), a
 * corner, then a spline along the lace line and over the toe (`front`, ending
 * at the sole's toe), closed along the sole.
 */
function upperPath(back: readonly Pt[], front: readonly Pt[], sole: Sole): string {
  return path(back[0], [...splineSegs(back), L(front[0]), ...splineSegs(front), ...sole.topBack], true);
}

/** The tongue: the part of `back` after the throat, closed back to the throat under the lace line. */
function tonguePanel(back: readonly Pt[], throatIndex: number): string {
  const pts = back.slice(throatIndex);
  return path(pts[0], [...splineSegs(pts), L(pts[0])], true);
}
const tongueShade = (back: readonly Pt[], throatIndex: number) => shade(tonguePanel(back, throatIndex), 0.14);

/**
 * A toe cap: its seam from the crown (an anchor of `front` at `capIndex`)
 * down to the sole at `base`, and the cap as a panel (seam + the toe's outline).
 */
function toeCap(front: readonly Pt[], capIndex: number, base: Pt, bulge = 4): { seam: string; panel: string } {
  const top = front[capIndex];
  const rise = top[1] - base[1];
  const seamPts: Pt[] = [base, [base[0] + bulge * 0.4, base[1] + rise * 0.45], [top[0] - 2, base[1] + rise * 0.8], top];
  return {
    seam: smooth(seamPts),
    panel: path(base, [...splineSegs(seamPts), ...splineSegs(front.slice(capIndex)), L(base)], true),
  };
}

/**
 * A heel counter: its seam from the collar down to the sole, and the panel
 * behind it (the heel's outline from the sole up to `back[topIndex]`).
 */
function heelCounter(back: readonly Pt[], topIndex: number, seamPts: readonly Pt[]): { seam: string; panel: string } {
  return {
    seam: smooth(seamPts),
    panel: path(back[0], [...splineSegs(back.slice(0, topIndex + 1)), L(seamPts[0]), ...splineSegs(seamPts), L(back[0])], true),
  };
}

/**
 * The quarter seam: where the vamp meets the quarter, from the end of the
 * lace line at `meet` down to the sole at x = `xSole`, bowing forward.
 */
function quarterSeam(meet: Pt, xSole: number): Pt[] {
  return [meet, [meet[0] + 4, meet[1] + (GROUND - meet[1]) * 0.35], [xSole - 1.5, GROUND - 10], [xSole, GROUND]];
}

/**
 * The colorblock panel as a designed two-tone: everything behind the quarter
 * seam (heel, quarter, collar, eyestay and tongue) in the pattern color, the
 * vamp and toe in the shoe's own. `back` runs from the heel to `meet`.
 */
function splitBlock(back: readonly Pt[], quarter: readonly Pt[]): string {
  return path(back[0], [...splineSegs(back), ...splineSegs(quarter), L(back[0])], true);
}

/** A padded collar: a seam a few units under the topline, from the heel to the throat. */
const collarSeam = (pts: readonly Pt[]) => seam(smooth(pts));


/** The low-top: the family's reference profile. */
function lowTop(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 15, spring: 6, midsole: true });
  const throat: Pt = [80, 66];
  const vamp: Pt = [124, 88];
  const meet = lerp(throat, vamp, 0.9);
  const back: Pt[] = [
    [18, GROUND], [15.5, 102], [15, 87], [17, 72], [22, 61], [31, 56.5], [44, 57.5], [58, 60], [71, 63], throat,
    [83, 60], [91, 57.5], [100, 58.5], [108, 62.5], [115, 69], [119, 76], meet,
  ];
  const front: Pt[] = [meet, vamp, [136, 91], [150, 94], [164, 98], [175, 103], [183, 108], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 11, 5, 0, 0.1, 0.9, LACE_W);
  const cap = toeCap(front, 4, [152, GROUND]);
  const counter = heelCounter(back, 6, [[44, 57.5], [46, 63], [41, 81], [38.5, 100], [39, GROUND]]);
  const collar = collarSeam([[17.5, 70], [24, 64], [33, 61.5], [46, 62.5], [58, 65], [70, 67.5], [77, 70]]);
  const quarter = quarterSeam(meet, 130);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      tongueShade(back, 9),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, collar, seam(counter.seam), seam(cap.seam), seam(smooth(quarter))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, quarter),
  });
}

/**
 * The high-top: the shaft rises well over the ankle to a padded collar, the
 * lacing runs all the way up the shaft to the vamp, a rubber toe cap.
 */
function highTop(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 14, spring: 6, midsole: true });
  const throat: Pt = [64, 30];
  const vamp: Pt = [140, 83];
  const meet = lerp(throat, vamp, 0.62);
  const back: Pt[] = [
    [18, GROUND], [15.5, 100], [15, 80], [16.5, 60], [19, 42], [23, 30], [30, 24], [42, 22], [54, 25], throat,
    [70, 26], [78, 24], [88, 25.5], [98, 32], [106, 42], [112, 54], meet,
  ];
  const front: Pt[] = [meet, vamp, [152, 85.5], [162, 88.5], [173, 93], [181.5, 99], [187, 106], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 10, 7, 0, 0.06, 0.94, LACE_W);
  const cap = toeCap(front, 3, [151, GROUND]);
  const counter = heelCounter(back, 7, [[42, 22], [45, 34], [43, 70], [41, 95], [41.5, GROUND]]);
  // The padded collar: a band under the topline from the heel to the throat,
  // deep enough to read at 56 px, with the ankle patch on its quarter.
  const collarPts: Pt[] = [[17.5, 50], [21, 38], [27, 32], [41, 30.5], [54, 33], [62, 37]];
  const collar = collarSeam(collarPts);
  const collarPad = shade(path([15.5, 62], [...splineSegs([[15.5, 62], [17.5, 50], [21, 38], [27, 32], [41, 30.5], [54, 33], [62, 37], [64, 30]]), L([54, 25]), L([42, 22]), L([30, 24]), L([23, 30]), L([19, 42]), L([16.5, 60])], true), 0.09);
  const ankle = `<circle cx="38" cy="49" r="5.5" fill="var(--icon-fill-2, #8c8c8c)" stroke="var(--icon-stroke, #000)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  const quarter = quarterSeam(meet, 134);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      tongueShade(back, 9),
      collarPad,
      fill(cap.panel, FILL2),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, collar, seam(counter.seam), stroke(cap.seam), seam(smooth(quarter))),
      ankle,
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, quarter),
  });
}

/** Chunky: a bulky, panelled upper with a mudguard on a thick scalloped sole. */
function chunky(): KitPiece {
  const s = footSole({ x0: 15, x1: 189, depth: 23, spring: 6, wave: true, midsole: true, ball: 48 });
  const throat: Pt = [84, 70];
  const vamp: Pt = [144, 82];
  const meet = lerp(throat, vamp, 0.9);
  const back: Pt[] = [
    [19, GROUND], [16, 102], [15.5, 86], [18, 72], [24, 62], [34, 57], [48, 58], [62, 62], [75, 67], throat,
    [90, 64.5], [98, 62], [110, 63], [122, 67], [131, 72.5], meet,
  ];
  const front: Pt[] = [meet, vamp, [156, 84.5], [166, 88], [177, 93], [185, 100], [189.5, 106.5], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 10, 5, 0, 0.1, 0.9, LACE_W);
  const cap = toeCap(front, 3, [155, GROUND]);
  const counter = heelCounter(back, 6, [[48, 58], [50, 64], [45, 80], [42, 100], [42.5, GROUND]]);
  const collar = collarSeam([[18.5, 70], [25, 64], [36, 62], [49, 63.5], [62, 67.5], [74, 72.5], [81, 76.5]]);
  // The chunky signature: a mudguard along the sole and a quarter sweeping down into it.
  const mudguard = smooth([[24, 103], [60, 100], [110, 102], [150, 105]]);
  const quarter = smooth([[98, 84], [102, 94], [108, 102]]);
  const split = quarterSeam(meet, 134);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      tongueShade(back, 9),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, collar, seam(counter.seam), seam(cap.seam), seam(mudguard), seam(quarter), seam(smooth(split))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, split),
  });
}

/** Running: a low, pointed profile with a flared heel tab on a cushioned, lifted midsole. */
function running(): KitPiece {
  const s = footSole({ x0: 16, x1: 188, depth: 11, spring: 8, heelLift: 7, midsole: true, ball: 52 });
  const throat: Pt = [82, 72];
  const vamp: Pt = [142, 84];
  const meet = lerp(throat, vamp, 0.9);
  const back: Pt[] = [
    [16, GROUND], [13, 102], [12, 86], [13, 72], [17, 62], [25, 57], [33, 59], [46, 63], [60, 67], [73, 70], throat,
    [88, 67], [96, 65], [108, 66], [120, 70], [129, 75.5], meet,
  ];
  const front: Pt[] = [meet, vamp, [154, 86], [164, 88.5], [175, 92.5], [183, 97.5], [188.5, 103.5], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 9.5, 5, 0, 0.1, 0.9, LACE_W);
  const cap = toeCap(front, 3, [156, GROUND], 2);
  const counter = heelCounter(back, 7, [[46, 63], [46, 68], [40, 84], [37, 102], [37, GROUND]]);
  const collar = collarSeam([[15, 72], [19, 65], [27, 62.5], [36, 64.5], [48, 68.5], [60, 72.5], [72, 76], [79, 78.5]]);
  // A long quarter line sweeping from the heel towards the toe.
  const sweep = smooth([[44, 76], [80, 94], [122, 102], [156, 100]]);
  const quarter = quarterSeam(meet, 134);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      tongueShade(back, 10),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, collar, seam(counter.seam), seam(cap.seam), seam(sweep), seam(smooth(quarter))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, quarter),
  });
}

/** Retro: a slim trainer with a T-toe, a slanted side band and a thin gum sole. */
function retro(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 9, spring: 5, midsole: true });
  const throat: Pt = [80, 74];
  const vamp: Pt = [142, 86];
  const meet = lerp(throat, vamp, 0.9);
  const back: Pt[] = [
    [18, GROUND], [15.5, 102], [15, 88], [17, 76], [22, 66], [31, 62], [44, 63.5], [58, 67], [71, 71], throat,
    [86, 68.5], [94, 66.5], [106, 67.5], [118, 71.5], [127, 77], meet,
  ];
  const front: Pt[] = [meet, vamp, [154, 88.5], [164, 91], [175, 95.5], [183, 101], [188, 107], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 10, 5, 0, 0.1, 0.9, LACE_W);
  const cap = toeCap(front, 3, [154, GROUND], 3);
  const counter = heelCounter(back, 6, [[44, 63.5], [46, 69], [41, 84], [38.5, 102], [39, GROUND]]);
  // T-toe: a stitch running forward along the crown from the cap seam.
  const tBar = smooth([[164, 91], [173, 93.5], [181, 98]]);
  // Side band: a slanted stripe of the second color from the stay down to the sole.
  const bandTop = (x: number) => lerp(stay.a2, stay.b2, (x - stay.a2[0]) / (stay.b2[0] - stay.a2[0]));
  const band = path(bandTop(104), [L(bandTop(118)), L([98, GROUND]), L([84, GROUND])], true);
  const quarter = quarterSeam(meet, 132);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      tongueShade(back, 9),
      fill(band, FILL2),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, stroke(band), seam(counter.seam), seam(cap.seam), seam(tBar), seam(smooth(quarter))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, quarter),
  });
}

/** Slip-on: no lacing, an elastic gore at the throat, a flat vulcanized sole. */
function slipOn(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 12, spring: 5, midsole: true });
  const goreBack: Pt = [66, 67];
  const goreFront: Pt = [92, 66];
  const outline: Pt[] = [
    [18, GROUND], [15.5, 102], [15, 88], [17, 75], [22, 66], [31, 62], [44, 63], [56, 65], goreBack, [79, 65.5], goreFront,
    [112, 69], [132, 75], [150, 81], [162, 86], [174, 92], [182, 99], [187.5, 106], s.toe,
  ];
  const upper = path(outline[0], [...splineSegs(outline), ...s.topBack], true);
  const cap = toeCap(outline, 14, [152, GROUND], 3);
  const counter = heelCounter(outline, 6, [[44, 63], [46, 68.5], [41, 84], [38.5, 102], [39, GROUND]]);
  const collar = collarSeam([[17.5, 73], [24, 68], [33, 67], [46, 68.5], [58, 70.5], [66, 72]]);
  // Elastic gore: a tapered insert with ribs, in the second color.
  const gore = path([68, 66.8], [L([90, 66.2]), L([87, 84]), L([73, 84])], true);
  const ribs = [74.5, 79, 83.5].map((x) => seam(polyline([x, 69], [x + (x - 79) * 0.1, 82])));
  const vampPts: Pt[] = [goreFront, [97, 82], [102, 102], [104, GROUND]];
  const vampSeam = smooth(vampPts);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      fill(gore, FILL2),
      ink(stroke(upper), stroke(gore), ...ribs, collar, seam(counter.seam), seam(vampSeam), seam(cap.seam)),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(outline.slice(0, 11), vampPts),
  });
}

export const SNEAKERS_FEET: Record<string, KitPiece> = {
  "sneakers~low-top": lowTop(),
  "sneakers~high-top": highTop(),
  "sneakers~chunky": chunky(),
  "sneakers~running": running(),
  "sneakers~retro": retro(),
  "sneakers~slip-on": slipOn(),
};
SNEAKERS_FEET["sneakers"] = SNEAKERS_FEET["sneakers~low-top"];
