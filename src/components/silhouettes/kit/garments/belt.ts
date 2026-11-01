/**
 * Belts, seen flat from above like the rest of the kit: the band coiled
 * into one ring with the buckle at the bottom, the tip through the buckle
 * and a keeper, lying on the band and curling a little into the loop. The
 * ring fills a square tile and the buckle is the biggest piece of hardware
 * in the set, so it still reads at 56 px.
 * Leather: a prong buckle, holes in the tip and edge stitching. Canvas: a
 * box buckle and a metal tip. Web: a pair of D-rings.
 */
import { C, CX, fill, ink, L, path, piece, polyline, seam, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { buckle, ellipseArc, metal, roundRect, smooth, splineSegs } from "../parts-feet";

const CY = 100;
/** Outer and inner radius of the coil; the band is the difference. */
const R = 92;
const RI = 64;
const W = R - RI;
/** Radius of the band's centerline. */
const RM = (R + RI) / 2;
/** The tip lies on the band this much closer to the center, so it overlaps the inner edge. */
const TIP_IN = 6;

const at = (radius: number, a: number): Pt => [CX + radius * Math.cos((a * Math.PI) / 180), CY + radius * Math.sin((a * Math.PI) / 180)];

/** A full circle as path data, clockwise (`dir` 1) or counter-clockwise (−1). */
function circle(radius: number, dir: 1 | -1 = 1): string {
  const k = radius * 1.33;
  const c = (x: number, y: number): Pt => [CX + x, CY + y];
  return dir > 0
    ? path(c(-radius, 0), [C(c(-radius, -k), c(radius, -k), c(radius, 0)), C(c(radius, k), c(-radius, k), c(-radius, 0))], true)
    : path(c(-radius, 0), [C(c(-radius, k), c(radius, k), c(radius, 0)), C(c(radius, -k), c(-radius, -k), c(-radius, 0))], true);
}

/** The coil: an annulus (outer clockwise, inner counter-clockwise, so a nonzero fill leaves the hole). */
const ring = circle(R) + circle(RI, -1);

/** An arc along the band, `k` of the way from the inner edge (0) to the outer (1), from angle a0 to a1. */
const along = (k: number, a0: number, a1: number) => smooth(ellipseArc(CX, CY, RI + W * k, RI + W * k, a0, a1, 28));

/**
 * The tip: the band's free end from the buckle at angle `a0` to its point
 * at `a1`, as wide as the band but shifted `TIP_IN` towards the center.
 */
function tip(a0: number, a1: number): string {
  const ro = R - TIP_IN;
  const ri = RI - TIP_IN;
  const outer = ellipseArc(CX, CY, ro, ro, a0, a1 - 8, 16);
  const inner = ellipseArc(CX, CY, ri, ri, a1 - 8, a0, 16);
  const point = at(RM - TIP_IN, a1);
  return path(outer[0], [
    ...splineSegs(outer),
    C(at(ro, a1 - 4), at(RM - TIP_IN + 3, a1 - 0.5), point),
    C(at(RM - TIP_IN - 3, a1 - 0.5), at(ri, a1 - 4), inner[0]),
    ...splineSegs(inner),
  ], true);
}

/** A keeper: a small loop across the band and the tip at angle `a`. */
function keeper(a: number, half = 2.6): string {
  const o = R + 1;
  const i = RI - TIP_IN - 1;
  return path(at(o, a - half), [L(at(o, a + half)), L(at(i, a + half)), L(at(i, a - half))], true);
}

/** A hole in the tip at angle `a`. */
const hole = (a: number) => {
  const [x, y] = at(RM - TIP_IN, a);
  return `<circle cx="${Math.round(x * 10) / 10}" cy="${Math.round(y * 10) / 10}" r="1.7" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
};

/** The buckle sits on the band at the bottom of the coil (angle 90), its prong pointing the way the tip runs. */
const BUCKLE: Pt = [CX, CY + RM];

function leather(): KitPiece {
  const bk = buckle(BUCKLE[0], BUCKLE[1], 32, W + 10, 4);
  const end = tip(94, 152);
  const kp = keeper(106);
  return piece({
    base: [fill(ring), fill(end)],
    lines: [
      ink(
        stroke(ring),
        seam(along(0.13, 112, 440)),
        seam(along(0.87, 112, 440)),
        stroke(end),
        seam(smooth(ellipseArc(CX, CY, R - TIP_IN - 3, R - TIP_IN - 3, 112, 146, 12))),
        seam(smooth(ellipseArc(CX, CY, RI - TIP_IN + 3, RI - TIP_IN + 3, 112, 146, 12))),
      ),
      hole(123),
      hole(133),
      fill(kp),
      ink(stroke(kp)),
      bk.fills,
      bk.lines,
    ],
    clip: ring + end,
    extent: [circle(R), bk.frame],
  });
}

/** A folded metal tip on the end of a strap, from angle `a0` to the end at `a1`. */
function metalTip(a0: number, a1: number): string {
  const ro = R - TIP_IN;
  const ri = RI - TIP_IN;
  return path(at(ro, a0), [...splineSegs(ellipseArc(CX, CY, ro, ro, a0, a1, 4)), L(at(ri, a1)), ...splineSegs(ellipseArc(CX, CY, ri, ri, a1, a0, 4))], true);
}

/** The strap's free end for canvas and web belts: square-cut, with a metal tip. */
function strapEnd(a0: number, a1: number): string {
  const ro = R - TIP_IN;
  const ri = RI - TIP_IN;
  return path(at(ro, a0), [...splineSegs(ellipseArc(CX, CY, ro, ro, a0, a1, 16)), L(at(ri, a1)), ...splineSegs(ellipseArc(CX, CY, ri, ri, a1, a0, 16))], true);
}

function canvas(): KitPiece {
  const end = strapEnd(94, 150);
  const cap = metalTip(142, 150);
  // Box buckle: a flat plate with a slide bar, on the band at the bottom.
  const box = roundRect(BUCKLE[0] - 17, BUCKLE[1] - W / 2 - 4.5, 34, W + 9, 2.5);
  const bar = polyline([BUCKLE[0] + 4, BUCKLE[1] - W / 2 - 2], [BUCKLE[0] + 4, BUCKLE[1] + W / 2 + 2]);
  return piece({
    base: [fill(ring), fill(end)],
    lines: [
      ink(stroke(ring), seam(along(0.16, 112, 440)), seam(along(0.84, 112, 440)), stroke(end), seam(smooth(ellipseArc(CX, CY, R - TIP_IN - 3.5, R - TIP_IN - 3.5, 112, 140, 10))), seam(smooth(ellipseArc(CX, CY, RI - TIP_IN + 3.5, RI - TIP_IN + 3.5, 112, 140, 10)))),
      metal(cap),
      ink(stroke(cap)),
      metal(box),
      ink(stroke(box), stroke(bar)),
    ],
    clip: ring + end,
    extent: [circle(R), box],
  });
}

/** A D-ring standing on the band: a metal annulus. */
function dRing(cx: number, cy: number, r: number): string {
  const c = (rad: number, dir: 1 | -1) => {
    const k = rad * 1.33;
    return dir > 0
      ? path([cx - rad, cy], [C([cx - rad, cy - k], [cx + rad, cy - k], [cx + rad, cy]), C([cx + rad, cy + k], [cx - rad, cy + k], [cx - rad, cy])], true)
      : path([cx - rad, cy], [C([cx - rad, cy + k], [cx + rad, cy + k], [cx + rad, cy]), C([cx + rad, cy - k], [cx - rad, cy - k], [cx - rad, cy])], true);
  };
  const ringStroke = (rad: number) => `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  return metal(c(r, 1) + c(r - 2.6, -1)) + ringStroke(r) + ringStroke(r - 2.6);
}

function web(): KitPiece {
  const end = strapEnd(94, 150);
  const cap = metalTip(142, 150);
  const rr = W / 2 + 5;
  return piece({
    base: [fill(ring), fill(end)],
    lines: [
      ink(stroke(ring), stroke(along(0.3, 112, 440)), stroke(along(0.7, 112, 440)), stroke(end), stroke(smooth(ellipseArc(CX, CY, RM - TIP_IN + W * 0.2, RM - TIP_IN + W * 0.2, 110, 140, 10))), stroke(smooth(ellipseArc(CX, CY, RM - TIP_IN - W * 0.2, RM - TIP_IN - W * 0.2, 110, 140, 10)))),
      metal(cap),
      ink(stroke(cap)),
      dRing(BUCKLE[0] - 7, BUCKLE[1], rr),
      dRing(BUCKLE[0] + 7, BUCKLE[1], rr),
    ],
    clip: ring + end,
    extent: [circle(R), roundRect(BUCKLE[0] - 7 - rr, BUCKLE[1] - rr - 1, 14 + rr * 2, rr * 2 + 2, 1)],
  });
}

export const BELT: Record<string, KitPiece> = {
  "belt~leather": leather(),
  "belt~canvas": canvas(),
  "belt~web": web(),
};
BELT["belt"] = BELT["belt~leather"];
