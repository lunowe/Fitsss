/**
 * Sneakers, side view, toe right. One last for the family: the heel counter
 * rises to a padded collar, the topline runs forward and a little down to
 * the throat, the tongue shows as a modest tab above the throat, the lace
 * line slopes gently to the vamp and the toe box in front of it is a rounded
 * volume (nearly level, then a full round to the tip) on a two-part sole in
 * the second color. The opening shows as a dark lens along the collar, the
 * way every shoe in the family is seen a touch from above. Variants change
 * the profile, the sole and one signature detail each, never the line.
 */
import { fill, FILL2, ink, L, lerp, path, piece, polyline, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { eyestay, footSole, GROUND, LACE_W, mouthLens, smooth, splineSegs, type Eyestay, type Sole } from "../parts-feet";

/**
 * The upper's outline: a spline up the heel, over the collar and the tongue
 * (`back`, ending where the tongue's front edge meets the lace line), a
 * corner, then a spline along the lace line and over the toe (`front`, ending
 * at the sole's toe), closed along the sole.
 */
function upperPath(back: readonly Pt[], front: readonly Pt[], sole: Sole): string {
  return path(back[0], [...splineSegs(back), L(front[0]), ...splineSegs(front), ...sole.topBack], true);
}

/**
 * The tongue's visible top: a rounded tab rising `rise` above the throat and
 * coming down to the lace line at `meet` (a point `t` of the way to the
 * vamp). Returns the points to append to the collar, ending at `meet`.
 */
function tongueTab(throat: Pt, vamp: Pt, rise: number, t = 0.45): Pt[] {
  const meet = lerp(throat, vamp, t);
  const w = meet[0] - throat[0];
  return [
    [throat[0] + rise * 0.55, throat[1] - rise * 0.8],
    [throat[0] + w * 0.42, throat[1] - rise],
    [throat[0] + w * 0.72, throat[1] - rise * 0.72],
    meet,
  ];
}

/** The tongue as a panel (its tab closed back along the lace line), shaded a touch so it sits behind the stay. */
function tongueShade(back: readonly Pt[], throatIndex: number): string {
  const pts = back.slice(throatIndex);
  return shade(path(pts[0], [...splineSegs(pts), L(pts[0])], true), 0.1);
}

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
 * The quarter seam: where the vamp meets the quarter, from the front end of
 * the eyestay's lower edge down to the sole at x = `xSole`, bowing forward.
 */
function quarterSeam(stay: Eyestay, xSole: number): Pt[] {
  const from = stay.b2;
  return [from, [from[0] + 3.5, from[1] + (GROUND - from[1]) * 0.4], [xSole - 1, GROUND - 8], [xSole, GROUND]];
}

/**
 * The colorblock panel as a designed two-tone: everything behind the quarter
 * seam (heel, quarter, collar, eyestay and tongue) in the pattern color, the
 * vamp and toe in the shoe's own. `back` runs from the heel to the tongue's
 * meeting point on the lace line.
 */
function splitBlock(back: readonly Pt[], vamp: Pt, quarter: readonly Pt[]): string {
  return path(back[0], [...splineSegs(back), L(vamp), L(quarter[0]), ...splineSegs(quarter), L(back[0])], true);
}

/** A padded collar: a seam a few units under the topline, from the heel to the throat. */
const collarSeam = (pts: readonly Pt[]) => seam(smooth(pts));

/** The heel counter seam, from the collar down to the sole. */
const counterSeam = (pts: readonly Pt[]) => seam(smooth(pts));

/** The low-top: the family's reference profile. */
function lowTop(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 13, spring: 6, midsole: true });
  const throat: Pt = [74, 64];
  const vamp: Pt = [128, 84];
  const collar: Pt[] = [[18, GROUND], [15.5, 104], [15, 90], [17, 76], [22, 66], [30, 60.5], [40, 58.5], [52, 59.5], [64, 61.5], throat];
  const back: Pt[] = [...collar, ...tongueTab(throat, vamp, 5, 0.46)];
  const meet = back[back.length - 1];
  const front: Pt[] = [meet, vamp, [140, 85.5], [154, 88], [166, 92.5], [176, 98.5], [183, 105.5], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 11, 5, 0, 0.1, 0.9, LACE_W);
  const cap = toeCap(front, 3, [152, GROUND]);
  const counter = counterSeam([[40, 58.5], [43, 64], [40, 82], [38, 102], [38.5, GROUND]]);
  const mouth = mouthLens([[26, 62.5], [40, 58.5], [52, 59.5], [64, 61.5], throat], 6);
  const quarter = quarterSeam(stay, 132);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      mouth,
      tongueShade(back, collar.length - 1),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, counter, seam(cap.seam), seam(smooth(quarter))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, vamp, quarter),
  });
}

/**
 * The high-top: a tall shaft with a near-vertical back and a level padded
 * collar, the lacing running the whole height of the shaft from the throat
 * to the vamp, an ankle patch on the quarter, a rubber toe cap.
 */
function highTop(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 14, spring: 6, midsole: true });
  const throat: Pt = [78, 33];
  const vamp: Pt = [142, 84];
  const collar: Pt[] = [[18, GROUND], [15.5, 100], [15, 80], [16, 62], [18, 46], [22, 35], [30, 28.5], [44, 26], [58, 27.5], [70, 30], throat];
  const back: Pt[] = [...collar, ...tongueTab(throat, vamp, 4.5, 0.36)];
  const meet = back[back.length - 1];
  const front: Pt[] = [meet, vamp, [154, 86.5], [166, 90.5], [176, 96.5], [183, 104], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 10, 8, 0, 0.06, 0.94, LACE_W);
  const cap = toeCap(front, 3, [158, GROUND], 5);
  const counter = counterSeam([[46, 72], [43, 86], [40.5, 102], [40.5, GROUND]]);
  const collarLine = collarSeam([[16.5, 52], [18.5, 40], [23.5, 34], [32, 31.5], [44, 30.5], [58, 32], [70, 34.5], [76, 37.5]]);
  const mouth = mouthLens([[24, 31], [44, 26], [58, 27.5], [70, 30], throat], 5.5);
  const ankle = `<circle cx="34" cy="52" r="4.5" fill="${FILL2}" stroke="var(--icon-stroke, #000)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  const quarter = quarterSeam(stay, 136);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      mouth,
      tongueShade(back, collar.length - 1),
      fill(cap.panel, FILL2),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, collarLine, counter, stroke(cap.seam), seam(smooth(quarter))),
      ankle,
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, vamp, quarter),
  });
}

/** Chunky: a bulky, panelled upper with a mudguard on a thick scalloped sole. */
function chunky(): KitPiece {
  const s = footSole({ x0: 15, x1: 189, depth: 22, spring: 6, wave: true, midsole: true, ball: 48 });
  const throat: Pt = [84, 68];
  const vamp: Pt = [144, 84];
  const collar: Pt[] = [[19, GROUND], [16, 102], [15.5, 86], [18, 72], [24, 62], [34, 57.5], [48, 58], [62, 61], [76, 65], throat];
  const back: Pt[] = [...collar, ...tongueTab(throat, vamp, 5, 0.46)];
  const meet = back[back.length - 1];
  const front: Pt[] = [meet, vamp, [156, 85.5], [168, 89], [178, 94.5], [185.5, 101], [189.5, 107], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 10, 5, 0, 0.1, 0.9, LACE_W);
  const cap = toeCap(front, 3, [156, GROUND]);
  const counter = counterSeam([[48, 58], [50, 64], [45, 80], [42, 100], [42.5, GROUND]]);
  const mouth = mouthLens([[28, 59.5], [48, 58], [62, 61], [76, 65], throat], 6);
  // The chunky signature: a mudguard along the sole and a quarter sweeping down into it.
  const mudguard = smooth([[24, 103], [60, 100], [110, 102], [152, 105]]);
  const sweep = smooth([[100, 86], [104, 95], [110, 102]]);
  const quarter = quarterSeam(stay, 138);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      mouth,
      tongueShade(back, collar.length - 1),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, counter, seam(cap.seam), seam(mudguard), seam(sweep), seam(smooth(quarter))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, vamp, quarter),
  });
}

/** Running: a low, pointed profile with a flared heel tab on a cushioned, lifted midsole. */
function running(): KitPiece {
  const s = footSole({ x0: 16, x1: 188, depth: 11, spring: 8, heelLift: 7, midsole: true, ball: 52 });
  const throat: Pt = [82, 71];
  const vamp: Pt = [142, 84];
  const collar: Pt[] = [[16, GROUND], [13, 104], [12, 88], [13, 74], [17, 64], [25, 58.5], [34, 59], [46, 62], [60, 66], [72, 69], throat];
  const back: Pt[] = [...collar, ...tongueTab(throat, vamp, 4.5, 0.46)];
  const meet = back[back.length - 1];
  const front: Pt[] = [meet, vamp, [154, 86], [166, 89], [176, 93.5], [184, 99], [188.5, 105], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 9.5, 5, 0, 0.1, 0.9, LACE_W);
  const cap = toeCap(front, 3, [156, GROUND], 2);
  const counter = counterSeam([[46, 62], [46, 68], [40, 84], [37, 102], [37, GROUND]]);
  const mouth = mouthLens([[21, 61], [34, 59], [46, 62], [60, 66], [72, 69], throat], 5.5);
  // A long quarter line sweeping from the heel towards the toe.
  const sweep = smooth([[44, 76], [80, 94], [122, 102], [156, 100]]);
  const quarter = quarterSeam(stay, 138);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      mouth,
      tongueShade(back, collar.length - 1),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, counter, seam(cap.seam), seam(sweep), seam(smooth(quarter))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, vamp, quarter),
  });
}

/** Retro: a slim trainer with a T-toe, a slanted side band and a thin gum sole. */
function retro(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 9, spring: 5, midsole: true });
  const throat: Pt = [80, 72];
  const vamp: Pt = [142, 86];
  const collar: Pt[] = [[18, GROUND], [15.5, 104], [15, 90], [17, 78], [22, 68], [31, 63.5], [44, 64], [58, 67], [71, 70], throat];
  const back: Pt[] = [...collar, ...tongueTab(throat, vamp, 4.5, 0.46)];
  const meet = back[back.length - 1];
  const front: Pt[] = [meet, vamp, [154, 88], [166, 91], [176, 95.5], [183, 101.5], [187.5, 107], s.toe];
  const upper = upperPath(back, front, s);
  const stay = eyestay(throat, vamp, 10, 5, 0, 0.1, 0.9, LACE_W);
  const cap = toeCap(front, 3, [154, GROUND], 3);
  const counter = counterSeam([[44, 64], [46, 69], [41, 84], [38.5, 102], [39, GROUND]]);
  const mouth = mouthLens([[26, 66], [44, 64], [58, 67], [71, 70], throat], 6);
  // T-toe: a stitch running forward along the crown from the cap seam.
  const tBar = smooth([[166, 91], [174, 94], [181, 98.5]]);
  // Side band: a slanted stripe of the second color from the stay down to the sole.
  const bandTop = (x: number) => lerp(stay.a2, stay.b2, (x - stay.a2[0]) / (stay.b2[0] - stay.a2[0]));
  const band = path(bandTop(104), [L(bandTop(118)), L([98, GROUND]), L([84, GROUND])], true);
  const quarter = quarterSeam(stay, 136);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      mouth,
      tongueShade(back, collar.length - 1),
      fill(band, FILL2),
      stay.laceFills,
      ink(stroke(upper), stroke(stay.top), seam(stay.bottom), ...stay.bars, stroke(band), counter, seam(cap.seam), seam(tBar), seam(smooth(quarter))),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: splitBlock(back, vamp, quarter),
  });
}

/** Slip-on: no lacing, an elastic gore at the throat, a flat vulcanized sole. */
function slipOn(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 12, spring: 5, midsole: true });
  const goreBack: Pt = [66, 66.5];
  const goreFront: Pt = [92, 66];
  const outline: Pt[] = [
    [18, GROUND], [15.5, 104], [15, 90], [17, 77], [22, 68], [31, 63.5], [44, 64], [56, 65], goreBack, [79, 65.5], goreFront,
    [112, 69], [130, 74.5], [148, 80.5], [162, 86], [174, 92], [182, 99], [187.5, 106], s.toe,
  ];
  const upper = path(outline[0], [...splineSegs(outline), ...s.topBack], true);
  const cap = toeCap(outline, 14, [152, GROUND], 3);
  const counter = counterSeam([[44, 64], [46, 69], [41, 84], [38.5, 102], [39, GROUND]]);
  const mouth = mouthLens([[26, 66], [44, 64], [56, 65], goreBack], 6);
  // Elastic gore: a tapered insert with ribs, in the second color.
  const gore = path([68, 66.5], [L([90, 66.2]), L([87, 84]), L([73, 84])], true);
  const ribs = [74.5, 79, 83.5].map((x) => seam(polyline([x, 69], [x + (x - 79) * 0.1, 82])));
  const vampPts: Pt[] = [goreFront, [97, 82], [102, 102], [104, GROUND]];
  const vampSeam = smooth(vampPts);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      mouth,
      fill(gore, FILL2),
      ink(stroke(upper), stroke(gore), ...ribs, counter, seam(vampSeam), seam(cap.seam)),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: path(outline[0], [...splineSegs(outline.slice(0, 11)), ...splineSegs(vampPts), L(outline[0])], true),
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
