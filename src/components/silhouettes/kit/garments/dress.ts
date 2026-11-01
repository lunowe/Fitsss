/**
 * Dress: each fit is its own shape. Fitted is a sleeveless sheath with a waist
 * seam; a-line has cap sleeves, a fitted bodice and a flared skirt; relaxed is
 * a shift with cap sleeves; slip hangs from thin straps with a V neck; wrap
 * crosses over at the bust and ties at the side of the waist.
 */
import { boundsOf, C, CX, FILL2, fill, ink, L, lerp, mirrored, path, piece, polyline, Q, seam, shade, stroke, symmetric, type Pt, type Seg } from "../draw";
import { sleeve } from "../parts-tops";
import type { ArtPanel, KitPiece } from "../types";
import { crewNeck } from "../torso";
import { crewRib } from "./tee";

const NECK_Y = 20;

/** The hem: a shallow droop at the center, with its stitch line. */
function hem(hw: number, y: number, droop: number): { seg: ReturnType<typeof Q>; line: string } {
  return {
    seg: Q([CX + hw * 0.5, y + droop], [CX, y + droop]),
    line: path([CX - hw + 2, y - 4], [Q([CX, y + droop - 4], [CX + hw - 2, y - 4])]),
  };
}

/** A straight seam across the body at `y`, inset `margin` from half width `hw`. */
const across = (hw: number, y: number, margin = 2) => polyline([CX - hw + margin, y], [CX + hw - margin, y]);

/**
 * Pattern panels for a flared skirt: the cloth either side of `split` (a path
 * from the waist seam at `y0` down to the hem at `y1`, on the right, starting
 * at x = `splitX`) is cut on its own grain, leaning out with the flare by
 * `lean` degrees, so stripes fan with the hem and a check turns with it
 * instead of staying parallel to the bodice. The tile turns about the top of
 * the split on the dress's own center line, so the pattern is continuous
 * where the panel meets the body and bends outward from there; the main clip
 * cuts the panels to the dress.
 */
function skirtPanels(outline: string, splitX: number, split: Seg[], y0: number, y1: number, lean: number): ArtPanel[] {
  const far = CX + 110;
  const right = path([CX, y0], [L([splitX, y0]), ...split, L([far, y1 + 12]), L([far, y0])], true);
  const left = mirrored(right);
  const [, by, , bh] = boundsOf([outline]);
  const cy = by + bh / 2;
  const hw = far - splitX;
  const hh = Math.max(Math.abs(y0 - cy), Math.abs(y1 + 12 - cy));
  const r = (n: number) => Math.round(n * 10) / 10;
  const box = (x0: number): ArtPanel["box"] => [r(x0), r(cy - hh), r(2 * hw), r(2 * hh)];
  return [
    { clip: right, box: box(splitX - hw), angle: -lean },
    { clip: left, box: box(2 * CX - splitX - hw), angle: lean },
  ];
}

function sheath(): KitPiece {
  const neckW = 14;
  const S: Pt = [CX + 36, NECK_Y + 7];
  const A: Pt = [CX + 45, NECK_Y + 46];
  const waist: Pt = [CX + 38, 110];
  const hip: Pt = [CX + 45, 168];
  const H: Pt = [CX + 41, 242];
  const neck = crewNeck(neckW, NECK_Y, 14);
  const h = hem(H[0] - CX, H[1], 2);
  const outline = symmetric(neck.start, [
    ...neck.segs,
    Q([CX + neckW + (36 - neckW) * 0.55, NECK_Y + 2], S),
    C([S[0] - 1, NECK_Y + 26], [CX + 38, A[1] - 1], A),
    C([CX + 44, lerp(A, waist, 0.45)[1]], [CX + 38.5, lerp(A, waist, 0.8)[1]], waist),
    C([CX + 38.5, lerp(waist, hip, 0.3)[1]], [CX + 45, lerp(waist, hip, 0.6)[1]], hip),
    C([CX + 45, lerp(hip, H, 0.4)[1]], [CX + 42, lerp(hip, H, 0.8)[1]], H),
    h.seg,
  ]);
  const rib = crewRib(neckW, NECK_Y, 14, 2.5);
  const binding = path([S[0] - 3, S[1] + 1.5], [C([S[0] - 4, NECK_Y + 27], [CX + 36.5, A[1] - 4], [A[0] - 1.5, A[1] - 3.5])]);
  // Bust darts from the waist seam.
  const dart = polyline([CX + 16, waist[1] - 0.5], [CX + 15, waist[1] - 26]);
  return piece({
    base: [fill(outline)],
    lines: [
      rib.fills,
      ink(stroke(outline), seam(binding), seam(mirrored(binding)), seam(across(waist[0] - CX, waist[1])), seam(dart), seam(mirrored(dart)), seam(h.line)),
      rib.lines,
    ],
    clip: outline,
    stripe: "h",
  });
}

function aLine(): KitPiece {
  const neckW = 14;
  const S: Pt = [CX + 50, NECK_Y + 8];
  const A: Pt = [CX + 46, S[1] + 30];
  const sl = sleeve(S, A, 30, 28, 22);
  const waist: Pt = [CX + 36, 104];
  const H: Pt = [CX + 74, 244];
  const neck = crewNeck(neckW, NECK_Y, 14);
  const h = hem(H[0] - CX, H[1], 7);
  const skirtLen = H[1] - waist[1];
  const outline = symmetric(neck.start, [
    ...neck.segs,
    Q([CX + neckW + (50 - neckW) * 0.55, NECK_Y + 2], S),
    ...sl.segs,
    C([CX + 45, lerp(A, waist, 0.45)[1]], [CX + 37, lerp(A, waist, 0.8)[1]], waist),
    C([CX + 37, waist[1] + skirtLen * 0.15], [CX + 36 + 38 * 0.5, waist[1] + skirtLen * 0.55], H),
    h.seg,
  ]);
  const rib = crewRib(neckW, NECK_Y, 14, 2.5);
  // Skirt panel seams that follow the flare.
  const gore: Seg = C([CX + 17.5, waist[1] + skirtLen * 0.3], [CX + 35, waist[1] + skirtLen * 0.7], [CX + 37, H[1] + 7 * 0.75 - 0.5]);
  const panel = path([CX + 17, waist[1] + 0.5], [gore]);
  return piece({
    base: [fill(outline)],
    lines: [
      rib.fills,
      ink(stroke(outline), sl.armSeams, sl.cuffLines(3.5), seam(across(waist[0] - CX, waist[1])), seam(panel), seam(mirrored(panel)), seam(h.line)),
      rib.lines,
    ],
    clip: outline,
    panels: [...sl.panels, ...skirtPanels(outline, CX + 17, [gore], waist[1], H[1] + 7, 13)],
    stripe: "h",
  });
}

function shift(): KitPiece {
  // A relaxed shift: cap sleeves, a bound round neck, and a body that falls
  // straight from the chest into a gentle A at the knee. The long, flared
  // skirt and the small sleeves keep it from reading as a long tee.
  const neckW = 14;
  const S: Pt = [CX + 47, NECK_Y + 8];
  const A: Pt = [CX + 45, S[1] + 30];
  const sl = sleeve(S, A, 33, 21, 19);
  const hip: Pt = [CX + 50, 150];
  const H: Pt = [CX + 63, 242];
  const neck = crewNeck(neckW, NECK_Y, 14);
  const h = hem(H[0] - CX, H[1], 5);
  const outline = symmetric(neck.start, [
    ...neck.segs,
    Q([CX + neckW + (47 - neckW) * 0.55, NECK_Y + 2], S),
    ...sl.segs,
    C([CX + 45, lerp(A, hip, 0.5)[1]], [CX + 48, lerp(A, hip, 0.85)[1]], hip),
    C([CX + 53, lerp(hip, H, 0.35)[1]], [CX + 60, lerp(hip, H, 0.75)[1]], H),
    h.seg,
  ]);
  const rib = crewRib(neckW, NECK_Y, 14, 2.5);
  // In-seam pockets at the hip.
  const pocket = path([CX + 47.5, 146], [Q([CX + 50.5, 156], [CX + 52, 170])]);
  return piece({
    base: [fill(outline)],
    lines: [rib.fills, ink(stroke(outline), sl.armSeams, sl.cuffLines(3.5), seam(pocket), seam(mirrored(pocket)), seam(h.line)), rib.lines],
    clip: outline,
    // The skirt's sides lean out from the hip, so a stripe bends gently with
    // the hem instead of cutting straight across the flare.
    panels: [...sl.panels, ...skirtPanels(outline, CX + 20, [L([CX + 31, H[1] + 5])], hip[1], H[1] + 5, 9)],
    stripe: "h",
  });
}

function slip(): KitPiece {
  const top = 60; // y of the front's top edge at the straps
  const vY = 72; // the V between
  const cornerX = 33;
  const strapTopX = 20;
  const H: Pt = [CX + 52, 242];
  const h = hem(H[0] - CX, H[1], 3);
  const outline = symmetric([CX, vY], [
    L([CX + cornerX, top]),
    C([CX + cornerX + 1, 82], [CX + 35.5, 96], [CX + 36, 110]),
    C([CX + 37, 155], [CX + 50, 215], H),
    h.seg,
  ]);
  // Straps: thin loops from the front corner over the shoulder to the back's top edge.
  const sw = 2.2;
  const backTop = 56;
  const strap = (x0: number, x1: number, y0: number, y1: number) =>
    path([x0 - sw / 2, y0], [L([x0 + sw / 2, y0]), L([x1 + sw / 2, y1]), L([x1 - sw / 2, y1])], true);
  const front = strap(CX + cornerX - 2.5, CX + strapTopX, top, NECK_Y + 1.5);
  const back = strap(CX + strapTopX + 0.6, CX + 26, NECK_Y + 1.5, backTop);
  // The back panel, seen between the straps above the front's V.
  const inside = path([CX - 26, backTop], [L([CX + 26, backTop]), L([CX + 26, vY - (vY - top) * (26 / cornerX)]), L([CX, vY]), L([CX - 26, vY - (vY - top) * (26 / cornerX)])], true);
  const bust = path([CX - cornerX + 2, top + 10], [Q([CX, vY + 9], [CX + cornerX - 2, top + 10])]);
  return piece({
    base: [fill(outline)],
    lines: [
      fill(inside),
      shade(inside, 0.22),
      fill(back),
      shade(back, 0.14),
      fill(front),
      fill(mirrored(back)),
      shade(mirrored(back), 0.14),
      fill(mirrored(front)),
      ink(
        stroke(outline),
        stroke(polyline([CX - 26, backTop], [CX + 26, backTop])),
        stroke(back),
        stroke(front),
        stroke(mirrored(back)),
        stroke(mirrored(front)),
        seam(bust),
        seam(h.line),
      ),
    ],
    clip: outline,
    extent: [outline, front, mirrored(front)],
    stripe: "h",
  });
}

function wrap(): KitPiece {
  const neckW = 14;
  const vY = 66;
  const S: Pt = [CX + 50, NECK_Y + 8];
  const A: Pt = [CX + 46, S[1] + 30];
  const sl = sleeve(S, A, 32, 30, 23);
  const waist: Pt = [CX + 37, 106];
  const H: Pt = [CX + 72, 242];
  const h = hem(H[0] - CX, H[1], 8);
  const skirtLen = H[1] - waist[1];
  const outline = symmetric([CX, vY], [
    L([CX + neckW, NECK_Y]),
    Q([CX + neckW + (50 - neckW) * 0.55, NECK_Y + 2], S),
    ...sl.segs,
    C([CX + 45, lerp(A, waist, 0.45)[1]], [CX + 38, lerp(A, waist, 0.8)[1]], waist),
    C([CX + 38, waist[1] + skirtLen * 0.15], [CX + 37 + 35 * 0.5, waist[1] + skirtLen * 0.55], H),
    h.seg,
  ]);
  // The over panel's edge: from the V across to the left of the waist, then
  // down the skirt to the hem.
  const knot: Pt = [CX - 33, 106];
  const over = path([CX, vY], [L([CX - 22, 102]), L([CX - 24, 110]), C([CX - 30, 150], [CX - 44, 205], [CX - 50, 244])]);
  const sash = across(waist[0] - CX, 102, 1.5) + across(waist[0] - CX, 110, 1.5);
  const tie = path([knot[0] - 2.5, knot[1] + 3], [L([knot[0] + 2.5, knot[1] + 3]), C([knot[0] + 3, 125], [knot[0] + 1, 138], [knot[0] + 2, 150]), L([knot[0] - 3.5, 150]), C([knot[0] - 4, 138], [knot[0] - 3, 125], [knot[0] - 2.5, knot[1] + 3])], true);
  const tie2 = path([knot[0] - 1, knot[1] + 3], [L([knot[0] + 4, knot[1] + 3]), C([knot[0] + 8, 120], [knot[0] + 11, 132], [knot[0] + 13, 142]), L([knot[0] + 7.5, 143]), C([knot[0] + 5, 132], [knot[0] + 2, 120], [knot[0] - 1, knot[1] + 3])], true);
  const knotShape = path([knot[0] - 4, knot[1] - 4], [L([knot[0] + 4, knot[1] - 4]), L([knot[0] + 4, knot[1] + 4]), L([knot[0] - 4, knot[1] + 4])], true);
  return piece({
    base: [fill(outline)],
    lines: [
      fill(tie2),
      shade(tie2, 0.1),
      fill(tie),
      fill(knotShape, FILL2),
      ink(stroke(outline), sl.armSeams, sl.cuffLines(3.5), stroke(over), seam(sash), stroke(tie2), stroke(tie), stroke(knotShape), seam(h.line)),
    ],
    clip: outline,
    panels: [...sl.panels, ...skirtPanels(outline, CX, [L([CX, H[1] + 8])], 110, H[1] + 8, 12)],
    stripe: "h",
  });
}

export const DRESS: Record<string, KitPiece> = {
  "dress@fitted": sheath(),
  "dress@a-line": aLine(),
  "dress@relaxed": shift(),
  "dress@slip": slip(),
  "dress@wrap": wrap(),
};
DRESS["dress"] = DRESS["dress@a-line"];
