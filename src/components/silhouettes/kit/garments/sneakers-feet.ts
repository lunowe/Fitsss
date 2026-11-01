/**
 * Sneakers, side view, toe right. One shared last for the family: the collar
 * sits at the heel, the throat opens into a laced eyestay over a tongue, the
 * toe box stays full and rounds off over a sprung toe, and a two-part sole in
 * the second color. Variants change the profile and the sole, never the line.
 */
import { C, FILL2, fill, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt, type Seg } from "../draw";
import type { KitPiece } from "../types";
import { footSole, GROUND, laceBars } from "../parts-feet";

/** The padded collar's inner lip, shaded: a sliver between the throat and the tongue. */
function throatShade(throat: Pt, tongue: Seg, back: Pt): string {
  return shade(path(throat, [tongue, Q([back[0] - 4, (back[1] + throat[1]) / 2 + 3], throat)], true), 0.3);
}

/**
 * A toe box from the end of the lacing to the toe tip: the crown stays full,
 * then rounds off into a nose that leans over the sprung tip. Returns the
 * segments and the point on the crown where a toe cap seam starts.
 */
function toeBox(vamp: Pt, tip: Pt, height: number, lean = 1): { segs: Seg[]; capTop: Pt; nose: Pt } {
  const capTop: Pt = [tip[0] - 18, tip[1] - height - 1];
  const nose: Pt = [tip[0] + lean, tip[1] - height * 0.5];
  const segs: Seg[] = [
    C([vamp[0] + 9, vamp[1] + 4], [capTop[0] - 6, capTop[1] - 1.5], capTop),
    C([capTop[0] + 11, capTop[1] + 2], [nose[0] - 0.5, nose[1] - height * 0.32], nose),
    C([nose[0] + 0.8, nose[1] + height * 0.22], [tip[0] + 1.5, tip[1] - 4], tip),
  ];
  return { segs, capTop, nose };
}

/** The toe cap seam from the crown down to the sole, and the matching colorblock panel. */
function toeCap(t: { segs: Seg[]; capTop: Pt }, tip: Pt): { seam: string; panel: string } {
  const base: Pt = [t.capTop[0] - 14, GROUND];
  const seamD = path(t.capTop, [C([t.capTop[0] - 7, t.capTop[1] + 10], [base[0] + 1, GROUND - 12], base)]);
  const panel = path(base, [C([base[0] + 1, GROUND - 12], [t.capTop[0] - 7, t.capTop[1] + 10], t.capTop), t.segs[1], t.segs[2], Q([tip[0] - 10, GROUND], base)], true);
  return { seam: seamD, panel };
}

/** The heel counter seam from a point on the topline down to the sole, and its panel. */
function heelCounter(heelSegs: Seg[], top: Pt, x0: number): { seam: string; panel: string } {
  const seamD = path(top, [C([top[0] - 8, top[1] + 20], [top[0] - 8, GROUND - 18], [top[0] - 4, GROUND])]);
  const panel = path([x0, GROUND], [...heelSegs, C([top[0] - 8, top[1] + 20], [top[0] - 8, GROUND - 18], [top[0] - 4, GROUND])], true);
  return { seam: seamD, panel };
}

/** A low-top: the family's reference profile. */
function lowTop(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 14, spring: 5, midsole: true });
  const heelTop: Pt = [27, 59];
  const counterTop: Pt = [48, 58];
  const throat: Pt = [74, 72];
  const tongueBack: Pt = [92, 51];
  const tongueFront: Pt = [108, 52];
  const vamp: Pt = [150, 78];
  const tongueSeg = C([74, 62], [80, 53], tongueBack);
  const heelSegs: Seg[] = [C([10, 110], [12, 68], heelTop), Q([38, 56], counterTop)];
  const toe = toeBox(vamp, s.toe, 27);
  const upper = path([18, GROUND], [
    ...heelSegs,
    C([60, 62], [68, 68], throat),
    tongueSeg,
    Q([100, 49], tongueFront),
    C([122, 60], [136, 70], vamp),
    ...toe.segs,
    ...s.topBack,
  ], true);
  const cap = toeCap(toe, s.toe);
  const counter = heelCounter(heelSegs, counterTop, 18);
  const stayBottom = path([84, 74], [C([100, 77], [128, 84], [154, 92])]);
  const laces = laceBars([109, 54], [148, 77], [89, 75], [150, 90], 5);
  const collar = path([31, 63], [Q([40, 60], [50, 62]), C([60, 66], [66, 71], [71, 76])]);
  const quarter = path([90, 76], [C([96, 90], [100, 104], [102, GROUND])]);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      throatShade(throat, tongueSeg, tongueBack),
      ink(stroke(upper), seam(collar), seam(counter.seam), seam(quarter), seam(cap.seam), stroke(stayBottom), ...laces),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: cap.panel + counter.panel,
  });
}

/** A high-top: the collar rises to an ankle cuff and the lacing runs all the way up. */
function highTop(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 14, spring: 5, midsole: true });
  const cuffBack: Pt = [26, 36];
  const cuffFront: Pt = [64, 33];
  const tongueBack: Pt = [78, 21];
  const tongueFront: Pt = [100, 26];
  const vamp: Pt = [150, 78];
  const tongueSeg = C([65, 26], [70, 21], tongueBack);
  const heelSegs: Seg[] = [C([9, 108], [12, 72], [16, 56]), C([18, 46], [20, 38], cuffBack)];
  const toe = toeBox(vamp, s.toe, 27);
  const upper = path([18, GROUND], [
    ...heelSegs,
    C([36, 31], [52, 30], cuffFront),
    tongueSeg,
    Q([92, 19], tongueFront),
    C([118, 42], [134, 64], vamp),
    ...toe.segs,
    ...s.topBack,
  ], true);
  const cap = toeCap(toe, s.toe);
  const stayBottom = path([72, 39], [C([90, 53], [122, 74], [154, 92])]);
  const laces = laceBars([103, 30], [148, 77], [78, 44], [150, 90], 7);
  const cuff = path([30, 41], [C([40, 36], [52, 35], [62, 38])]);
  // The heel counter cups the back of the shoe below the ankle.
  const counterSeam = path([14, 80], [C([28, 80], [40, 96], [44, GROUND])]);
  const heelPanel = path([18, GROUND], [C([9, 108], [12, 72], [14, 80]), C([28, 80], [40, 96], [44, GROUND])], true);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      throatShade(cuffFront, tongueSeg, tongueBack),
      ink(stroke(upper), seam(cuff), seam(counterSeam), seam(cap.seam), stroke(stayBottom), ...laces),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: cap.panel + heelPanel,
  });
}

/** Chunky: a bulky, panelled upper on a thick scalloped sole that lips out past it. */
function chunky(): KitPiece {
  const s = footSole({ x0: 15, x1: 189, depth: 23, spring: 5, wave: true, midsole: true, ball: 48 });
  const heelTop: Pt = [30, 54];
  const counterTop: Pt = [50, 53];
  const throat: Pt = [78, 70];
  const tongueBack: Pt = [96, 46];
  const tongueFront: Pt = [113, 48];
  const vamp: Pt = [152, 76];
  const tip: Pt = [186, GROUND - 4];
  const tongueSeg = C([78, 59], [84, 48], tongueBack);
  const heelSegs: Seg[] = [C([10, 110], [13, 64], heelTop), Q([40, 50], counterTop)];
  const toe = toeBox(vamp, tip, 30, 1.5);
  const upper = path([19, GROUND], [
    ...heelSegs,
    C([62, 58], [71, 65], throat),
    tongueSeg,
    Q([105, 44], tongueFront),
    C([126, 58], [140, 68], vamp),
    ...toe.segs,
    Q([176, GROUND], [138, GROUND]),
    L([19, GROUND]),
  ], true);
  const cap = toeCap(toe, tip);
  const counter = heelCounter(heelSegs, counterTop, 19);
  const stayBottom = path([88, 72], [C([104, 75], [130, 82], [156, 90])]);
  const laces = laceBars([114, 50], [150, 75], [93, 73], [152, 88], 5);
  const collar = path([34, 58], [Q([42, 55], [52, 57]), C([62, 61], [70, 68], [75, 74])]);
  // The chunky signature: a mudguard panel along the sole and a quarter sweeping into it.
  const mudguard = path([22, 104], [C([60, 101], [120, 104], [150, 106])]);
  const quarter = path([92, 76], [C([98, 90], [104, 100], [112, 104])]);
  const midsoleLine = path([13, 131], [Q([100, 134], [190, 128])]);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      throatShade(throat, tongueSeg, tongueBack),
      ink(stroke(upper), seam(collar), seam(counter.seam), seam(quarter), seam(mudguard), seam(cap.seam), stroke(stayBottom), ...laces, seam(midsoleLine)),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: cap.panel + counter.panel,
  });
}

/** Running: a low, pointed profile with a flared heel on a cushioned, lifted midsole. */
function running(): KitPiece {
  const s = footSole({ x0: 16, x1: 188, depth: 11, spring: 8, heelLift: 7, midsole: true, ball: 52 });
  const heelTop: Pt = [24, 56];
  const counterTop: Pt = [40, 59];
  const throat: Pt = [80, 70];
  const tongueBack: Pt = [96, 51];
  const tongueFront: Pt = [111, 53];
  const vamp: Pt = [152, 76];
  const tongueSeg = C([80, 60], [86, 52], tongueBack);
  const heelSegs: Seg[] = [C([8, 108], [6, 64], heelTop), Q([34, 53], counterTop)];
  const toe = toeBox(vamp, s.toe, 21, 2);
  const upper = path([16, GROUND], [
    ...heelSegs,
    C([56, 66], [70, 70], throat),
    tongueSeg,
    Q([104, 50], tongueFront),
    C([126, 60], [140, 68], vamp),
    ...toe.segs,
    ...s.topBack,
  ], true);
  const cap = toeCap(toe, s.toe);
  const counter = heelCounter(heelSegs, counterTop, 16);
  const stayBottom = path([90, 73], [C([106, 76], [130, 82], [156, 90])]);
  const laces = laceBars([112, 55], [150, 75], [95, 74], [152, 88], 5);
  const collar = path([28, 61], [Q([38, 58], [48, 64]), C([58, 69], [68, 73], [76, 75])]);
  // A long quarter line sweeping from the heel towards the toe.
  const sweep = path([44, 72], [C([70, 86], [110, 100], [156, 98])]);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      throatShade(throat, tongueSeg, tongueBack),
      ink(stroke(upper), seam(collar), seam(counter.seam), seam(sweep), seam(cap.seam), stroke(stayBottom), ...laces),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: cap.panel + counter.panel,
  });
}

/** Retro: a slim trainer with a T-toe, a slanted side band and a thin gum sole. */
function retro(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 9, spring: 4, midsole: true });
  const heelTop: Pt = [27, 63];
  const counterTop: Pt = [48, 61];
  const throat: Pt = [76, 74];
  const tongueBack: Pt = [92, 55];
  const tongueFront: Pt = [108, 56];
  const vamp: Pt = [150, 80];
  const tongueSeg = C([76, 64], [80, 57], tongueBack);
  const heelSegs: Seg[] = [C([10, 110], [13, 70], heelTop), Q([40, 59], counterTop)];
  const toe = toeBox(vamp, s.toe, 24);
  const upper = path([18, GROUND], [
    ...heelSegs,
    C([60, 66], [68, 71], throat),
    tongueSeg,
    Q([100, 53], tongueFront),
    C([122, 63], [136, 72], vamp),
    ...toe.segs,
    ...s.topBack,
  ], true);
  const cap = toeCap(toe, s.toe);
  const counter = heelCounter(heelSegs, counterTop, 18);
  const stayBottom = path([86, 76], [C([102, 79], [128, 86], [152, 94])]);
  const laces = laceBars([110, 58], [148, 79], [91, 77], [150, 92], 5);
  // T-toe: a stitch running forward along the crown from the cap seam.
  const tBar = path(toe.capTop, [Q([toe.capTop[0] + 10, toe.capTop[1] + 2], [toe.nose[0] - 3, toe.nose[1] - 6])]);
  // Side band: a slanted stripe of the second color from the stay to the sole.
  const band = path([106, 90], [L([120, 90]), L([98, GROUND]), L([84, GROUND])], true);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      throatShade(throat, tongueSeg, tongueBack),
      fill(band, FILL2),
      ink(stroke(upper), stroke(band), seam(counter.seam), seam(cap.seam), seam(tBar), stroke(stayBottom), ...laces),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: cap.panel + counter.panel,
  });
}

/** Slip-on: no lacing, an elastic gore at the throat, a flat vulcanized sole with its foxing. */
function slipOn(): KitPiece {
  const s = footSole({ x0: 18, x1: 186, depth: 12, spring: 4, midsole: true });
  const heelTop: Pt = [27, 62];
  const counterTop: Pt = [48, 61];
  const goreBack: Pt = [72, 68];
  const goreFront: Pt = [96, 66];
  const vamp: Pt = [152, 82];
  const heelSegs: Seg[] = [C([10, 110], [13, 69], heelTop), Q([40, 58], counterTop)];
  const toe = toeBox(vamp, s.toe, 25);
  const upper = path([18, GROUND], [
    ...heelSegs,
    C([60, 66], [66, 68], goreBack),
    Q([84, 63], goreFront),
    C([118, 68], [140, 76], vamp),
    ...toe.segs,
    ...s.topBack,
  ], true);
  const cap = toeCap(toe, s.toe);
  const counter = heelCounter(heelSegs, counterTop, 18);
  // Elastic gore: a tapered insert with ribs, in the second color.
  const gore = path(goreBack, [Q([84, 63], goreFront), L([90, 86]), L([78, 86])], true);
  const ribs = [80, 86, 92].map((x) => seam(polyline([x - 1, 67], [x - 1.4, 84])));
  const collar = path([31, 66], [Q([40, 63], [50, 66]), C([58, 69], [64, 71], [70, 72])]);
  const vampSeam = path([98, 68], [C([104, 84], [104, 104], [106, GROUND])]);
  const foxing = polyline([19, 122], [185, 121.5]);
  return piece({
    base: [fill(upper)],
    lines: [
      s.fills,
      fill(gore, FILL2),
      ink(stroke(upper), stroke(gore), ...ribs, seam(collar), seam(counter.seam), seam(vampSeam), seam(cap.seam), seam(foxing)),
      s.lines,
    ],
    clip: upper,
    extent: [upper, s.path],
    block: cap.panel + counter.panel,
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
