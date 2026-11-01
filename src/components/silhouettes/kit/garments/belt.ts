/**
 * Belts, the way a product flat shows them: folded in half and laid flat,
 * the fold on the left, two straps lying one above the other, the buckle on
 * the end of the top strap and the tip of the bottom strap relaxing a little
 * downwards just short of it. The two parallel bands, the U of the fold and
 * the square buckle read as "belt" at 56 px, and the buckle is the biggest
 * piece of hardware in the set. Leather: a prong buckle, a keeper, holes in
 * the tip and edge stitching. Canvas: a box buckle and a metal tip. Web: a
 * pair of D-rings on a woven strap.
 */
import { C, fill, ink, L, path, piece, polyline, seam, stroke, type Pt, type Seg } from "../draw";
import type { KitPiece } from "../types";
import { buckle, metal, roundRect, splineSegs } from "../parts-feet";

/** Strap width. */
const W = 24;
/** Gap between the two straps at the fold. */
const GAP = 12;
/** x of the fold's outer edge and of the buckle end of the top strap. */
const X0 = 10;
const X1 = 172;
/** y of the top strap's upper edge; the bottom strap starts GAP under it. */
const Y0 = 62;
const Y1 = Y0 + W + GAP;
/** Where the bottom strap ends (its tip or metal end). */
const TIP_X = 162;
/** The bottom strap relaxes this far down from the fold to its tip. */
const DROOP = 9;
/** x where the fold's curve meets the straight straps. */
const XF = X0 + (Y1 + W - Y0) / 2;

/** y of the bottom strap's upper edge at x: level at the fold, sagging towards the tip. */
const sag = (x: number): number => {
  const t = Math.max(0, Math.min(1, (x - XF) / (TIP_X - XF)));
  return Y1 + DROOP * t * t * (3 - 2 * t);
};

/** Points along the bottom strap's edge `k` in from its top (0) towards its bottom (W), from x0 to x1. */
function lower(k: number, x0: number, x1: number, n = 12): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push([x, sag(x) + k]);
  }
  return pts;
}

const TOP: Pt = [X1, Y0 + W / 2];
const K = 0.552;

/** The fold as path segments: the inside curve (top strap → bottom strap) and the outside curve (bottom → top). */
function foldInside(): Seg[] {
  const r = GAP / 2;
  const cy = Y0 + W + r;
  return [C([XF - r * K, Y0 + W], [XF - r, cy - r * K], [XF - r, cy]), C([XF - r, cy + r * K], [XF - r * K, Y1], [XF, Y1])];
}
function foldOutside(): Seg[] {
  const r = (Y1 + W - Y0) / 2;
  const cy = Y0 + r;
  return [C([XF - r * K, Y1 + W], [X0, cy + r * K], [X0, cy]), C([X0, cy - r * K], [XF - r * K, Y0], [XF, Y0])];
}

/**
 * The folded band as one closed shape: along the top strap to its end, back
 * along its lower edge to the fold, round the inside of the fold onto the
 * bottom strap, out along its sagging upper edge, round its end (`end`), back
 * along its lower edge and round the outside of the fold.
 */
function band(end: (top: Pt, bot: Pt) => Seg[]): string {
  const up = lower(0, XF, TIP_X - 12);
  const down = lower(W, TIP_X - 12, XF);
  return path([XF, Y0], [
    L([X1, Y0]),
    L([X1, Y0 + W]),
    L([XF, Y0 + W]),
    ...foldInside(),
    ...splineSegs(up),
    ...end(up[up.length - 1], down[0]),
    ...splineSegs(down),
    ...foldOutside(),
  ], true);
}

/** A pointed leather tip from the strap's upper edge at `top` to its lower edge at `bot`. */
const leatherTip = (top: Pt, bot: Pt): Seg[] => {
  const my = (top[1] + bot[1]) / 2 + 1;
  return [
    C([TIP_X - 4, top[1] + 0.5], [TIP_X, my - 4], [TIP_X, my]),
    C([TIP_X, my + 4], [TIP_X - 4, bot[1] - 0.5], bot),
  ];
};

/** A square-cut strap end. */
const squareTip = (top: Pt, bot: Pt): Seg[] => [L([TIP_X, top[1] + 0.3]), L([TIP_X, bot[1] - 0.3]), L(bot)];

/** Edge stitching along both straps and round the fold, `k` in from each edge. */
function stitching(k: number, x0: number, x1: number): string[] {
  const rIn = GAP / 2 - k;
  const rOut = (Y1 + W - Y0) / 2 - k;
  const cy = Y0 + (Y1 + W - Y0) / 2;
  const inner = path([x1, Y0 + W - k], [
    L([XF, Y0 + W - k]),
    C([XF - rIn * K, Y0 + W - k], [XF - rIn, cy - rIn * K], [XF - rIn, cy]),
    C([XF - rIn, cy + rIn * K], [XF - rIn * K, Y1 + k], [XF, Y1 + k]),
    ...splineSegs(lower(k, XF, x0)),
  ]);
  const outer = path([x1, Y0 + k], [
    L([XF, Y0 + k]),
    C([XF - rOut * K, Y0 + k], [X0 + k, cy - rOut * K], [X0 + k, cy]),
    C([X0 + k, cy + rOut * K], [XF - rOut * K, Y1 + W - k], [XF, Y1 + W - k]),
    ...splineSegs(lower(W - k, XF, x0)),
  ]);
  return [seam(inner), seam(outer)];
}

/** A hole in the bottom strap at x. */
const hole = (x: number) =>
  `<circle cx="${x}" cy="${(sag(x) + W / 2).toFixed(1)}" r="2" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;

/** A keeper loop across the top strap at x. */
const keeper = (x: number, w = 6) => roundRect(x - w / 2, Y0 - 1.5, w, W + 3, 1.2);

/** A folded metal tip on the end of the bottom strap, following its slope. */
function metalTip(): string {
  const x = TIP_X - 10;
  return path([x, sag(x) - 1], [L([TIP_X + 0.5, sag(TIP_X) - 1]), L([TIP_X + 0.5, sag(TIP_X) + W + 1]), L([x, sag(x) + W + 1])], true);
}

function leather(): KitPiece {
  const d = band(leatherTip);
  const bk = buckle(TOP[0] - 1, TOP[1], 30, W + 12, 4.6);
  const kp = keeper(TOP[0] - 27);
  return piece({
    base: [fill(d)],
    lines: [
      ink(stroke(d), ...stitching(3.2, TIP_X - 14, TOP[0] - 14)),
      hole(112),
      hole(126),
      hole(140),
      fill(kp),
      ink(stroke(kp)),
      bk.fills,
      bk.lines,
    ],
    clip: d,
    extent: [d, bk.frame],
  });
}

function canvas(): KitPiece {
  const d = band(squareTip);
  // Box buckle: a flat plate with a slide bar, on the end of the top strap.
  const box = roundRect(TOP[0] - 22, Y0 - 5, 36, W + 10, 2.5);
  const bar = polyline([TOP[0] + 2, Y0 - 2.5], [TOP[0] + 2, Y0 + W + 2.5]);
  const cap = metalTip();
  return piece({
    base: [fill(d)],
    lines: [
      ink(stroke(d), ...stitching(3.8, TIP_X - 10, TOP[0] - 24)),
      metal(cap),
      ink(stroke(cap)),
      metal(box),
      ink(stroke(box), stroke(bar)),
    ],
    clip: d,
    extent: [d, box],
  });
}

/** A D-ring standing on the strap: a metal annulus. */
function dRing(cx: number, cy: number, r: number): string {
  const c = (rad: number, dir: 1 | -1) => {
    const k = rad * 1.33;
    return dir > 0
      ? path([cx - rad, cy], [C([cx - rad, cy - k], [cx + rad, cy - k], [cx + rad, cy]), C([cx + rad, cy + k], [cx - rad, cy + k], [cx - rad, cy])], true)
      : path([cx - rad, cy], [C([cx - rad, cy + k], [cx + rad, cy + k], [cx + rad, cy]), C([cx + rad, cy - k], [cx - rad, cy - k], [cx - rad, cy])], true);
  };
  const ringStroke = (rad: number) => `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  return metal(c(r, 1) + c(r - 3, -1)) + ringStroke(r) + ringStroke(r - 3);
}

function web(): KitPiece {
  const d = band(squareTip);
  const cap = metalTip();
  const rr = W / 2 + 5;
  // Webbing: two woven lines along each strap, running round the fold.
  const weave = [0.34, 0.66].map((k) => {
    const rIn = GAP / 2 + W * (1 - k);
    const cy = Y0 + W + GAP / 2;
    return stroke(path([TOP[0] - 24, Y0 + W * k], [
      L([XF, Y0 + W * k]),
      C([XF - rIn * K, Y0 + W * k], [XF - rIn, cy - rIn * K], [XF - rIn, cy]),
      C([XF - rIn, cy + rIn * K], [XF - rIn * K, Y1 + W * (1 - k)], [XF, Y1 + W * (1 - k)]),
      ...splineSegs(lower(W * (1 - k), XF, TIP_X - 11)),
    ]));
  });
  return piece({
    base: [fill(d)],
    lines: [
      ink(stroke(d), ...weave),
      metal(cap),
      ink(stroke(cap)),
      dRing(TOP[0] - 12, TOP[1], rr),
      dRing(TOP[0] + 3, TOP[1], rr),
    ],
    clip: d,
    extent: [d, roundRect(TOP[0] - 12 - rr, TOP[1] - rr - 1, 15 + rr * 2, rr * 2 + 2, 1)],
  });
}

export const BELT: Record<string, KitPiece> = {
  "belt~leather": leather(),
  "belt~canvas": canvas(),
  "belt~web": web(),
};
BELT["belt"] = BELT["belt~leather"];
