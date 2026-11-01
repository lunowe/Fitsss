/**
 * Belts: a buckled strap lying in a lazy S, buckle at the top left, tip at
 * the bottom right, so it fills a square tile and still reads as a belt.
 * Leather: a prong buckle, a keeper, stitched edges and holes. Canvas: a
 * box slider with a metal tip, no holes. Web: a pair of D-rings and the
 * woven stripes.
 */
import { C, fill, ink, L, path, piece, polyline, Q, seam, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { buckle, metal, ribbon, ring, roundRect, sampleCubic } from "../parts-feet";

const W = 17;
const START: Pt = [36, 50];
const END: Pt = [176, 154];

/** The strap's spine: horizontal at both ends, sweeping through the middle. */
const SPINE = sampleCubic(START, [116, 50], [84, 154], END, 44);

/** The pointed tip of a strap at the end of a ribbon, continuing its direction. */
function tip(r: ReturnType<typeof ribbon>, len: number, round = false): string {
  const n = r.spine.length - 1;
  const p = r.spine[n];
  const q = r.spine[n - 1];
  const d = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
  const u: Pt = [(p[0] - q[0]) / d, (p[1] - q[1]) / d];
  const v: Pt = [-u[1], u[0]];
  const a: Pt = [p[0] + v[0] * (W / 2), p[1] + v[1] * (W / 2)];
  const b: Pt = [p[0] - v[0] * (W / 2), p[1] - v[1] * (W / 2)];
  const t: Pt = [p[0] + u[0] * len, p[1] + u[1] * len];
  if (round) return path(a, [C([a[0] + u[0] * len * 0.9, a[1] + u[1] * len * 0.9], [b[0] + u[0] * len * 0.9, b[1] + u[1] * len * 0.9], b), L(p)], true);
  return path(a, [Q([a[0] + u[0] * len * 0.55, a[1] + u[1] * len * 0.55], t), Q([b[0] + u[0] * len * 0.55, b[1] + u[1] * len * 0.55], b), L(p)], true);
}

function leather(): KitPiece {
  const r = ribbon(SPINE, W);
  const end = tip(r, 9);
  const bk = buckle(START[0] - 8, START[1], 18, W + 9, 3.4);
  const keeper = roundRect(START[0] + 12, START[1] - W / 2 - 1.5, 6, W + 3, 1);
  const holes = [30, 32, 34, 36, 38].map((i) => ring(r.spine[i][0], r.spine[i][1], 1.4));
  return piece({
    base: [fill(r.outline), fill(end)],
    lines: [
      fill(keeper),
      ink(stroke(r.outline), stroke(end), seam(r.along(-0.68, 2)), seam(r.along(0.68, 2)), stroke(keeper)),
      bk.fills,
      bk.lines,
      ...holes,
    ],
    clip: r.outline + end,
    extent: [r.outline, end, bk.frame],
  });
}

function canvas(): KitPiece {
  const r = ribbon(SPINE, W);
  // Box slider at the start, a folded metal tip at the end.
  const box = roundRect(START[0] - 14, START[1] - W / 2 - 3.5, 24, W + 7, 2);
  const boxBar = polyline([START[0] - 3, START[1] - W / 2 - 1.5], [START[0] - 3, START[1] + W / 2 + 1.5]);
  const n = r.spine.length - 1;
  const tipSeam = path(r.spine[n - 2], [L(r.spine[n])]);
  const cap = tip(r, 4, true);
  const capBand = ribbon(r.spine.slice(n - 3), W + 1.5);
  return piece({
    base: [fill(r.outline)],
    lines: [
      ink(stroke(r.outline), seam(r.along(-0.5, 3)), seam(r.along(0.5, 3))),
      metal(box),
      metal(capBand.outline + cap),
      ink(stroke(box), stroke(boxBar), stroke(capBand.outline), stroke(cap), seam(tipSeam)),
    ],
    clip: r.outline,
    extent: [r.outline, box, cap],
  });
}

/** A D-ring: a metal annulus. */
function dRing(cx: number, cy: number, r: number): string {
  const circle = (rad: number) => path([cx - rad, cy], [C([cx - rad, cy - rad * 1.33], [cx + rad, cy - rad * 1.33], [cx + rad, cy]), C([cx + rad, cy + rad * 1.33], [cx - rad, cy + rad * 1.33], [cx - rad, cy])], true);
  return metal(circle(r) + circle(r - 2.2)) + ring(cx, cy, r) + ring(cx, cy, r - 2.2);
}

function web(): KitPiece {
  const r = ribbon(SPINE, W);
  const cap = tip(r, 4, true);
  const capBand = ribbon(r.spine.slice(r.spine.length - 4), W + 1.5);
  return piece({
    base: [fill(r.outline)],
    lines: [
      ink(stroke(r.outline), stroke(r.along(-0.32, 1)), stroke(r.along(0.32, 1))),
      metal(capBand.outline + cap),
      ink(stroke(capBand.outline), stroke(cap)),
      dRing(START[0] - 5, START[1], W / 2 + 3.5),
      dRing(START[0] + 4, START[1], W / 2 + 3.5),
    ],
    clip: r.outline,
    extent: [r.outline, cap, roundRect(START[0] - 16, START[1] - W / 2 - 4, 28, W + 8, 1)],
  });
}

export const BELT: Record<string, KitPiece> = {
  "belt~leather": leather(),
  "belt~canvas": canvas(),
  "belt~web": web(),
};
BELT["belt"] = BELT["belt~leather"];
