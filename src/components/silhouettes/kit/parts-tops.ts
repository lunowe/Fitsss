/**
 * Shared parts for the tops, layers and full-body group: rib trims, plackets,
 * zips, stand and fold collars, pockets, and a sleeve builder for bodies that
 * `torso()` cannot describe (dresses, jumpsuits). Everything here follows the
 * kit's one-line language: trims in FILL2, seams at SEAM, hardware as buttons.
 */
import { add, button, C, CX, dir, FILL2, fill, L, lerp, mirrored, path, perp, polyline, Q, seam, shade, stroke, symmetric, type Pt, type Seg } from "./draw";
import type { Torso } from "./torso";

/* ------------------------------------------------------------------ */
/* Trims                                                                */
/* ------------------------------------------------------------------ */

/** Rib hem and cuffs in the second color, `hem` and `cuff` units deep, with their seams. */
export function ribTrims(t: Torso, hem: number, cuff: number): { fills: string; lines: string } {
  const band = t.cuffBand(cuff);
  return {
    fills: fill(t.hemBand(hem), FILL2) + fill(band, FILL2) + fill(mirrored(band), FILL2),
    lines: t.cuffLines(cuff) + seam(t.hemLine(hem)),
  };
}

/** A frame line `w` wide on the center, to widen a sleeveless piece's viewBox to the family's scale. */
export const frame = (w: number, y: number): string => polyline([CX - w / 2, y], [CX + w / 2, y]);

/* ------------------------------------------------------------------ */
/* Openings                                                             */
/* ------------------------------------------------------------------ */

/**
 * A placket `hw` half wide from `y0` to `y1`: its two edge seams (and the
 * bottom when `closed`), and `count` buttons on the center line.
 */
export function placket(y0: number, y1: number, hw: number, count: number, closed = true, r = 1.8): { lines: string; buttons: string } {
  const edges = closed
    ? seam(path([CX - hw, y0], [L([CX - hw, y1]), L([CX + hw, y1]), L([CX + hw, y0])]))
    : seam(polyline([CX - hw, y0], [CX - hw, y1])) + seam(polyline([CX + hw, y0], [CX + hw, y1]));
  let buttons = "";
  for (let i = 0; i < count; i++) buttons += button(CX, y0 + ((y1 - y0) * (i + 0.5)) / count, r);
  return { lines: edges, buttons };
}

/**
 * A center-front zip from `y0` to `y1`: the teeth as one full line, the tape
 * stitching either side, and a pull tab hanging from the top.
 */
export function zip(y0: number, y1: number, tape = 2.6): { lines: string; pull: string } {
  const side = polyline([CX + tape, y0 + 0.5], [CX + tape, y1 - 0.5]);
  const pull = path([CX - 1.6, y0 + 1.5], [L([CX + 1.6, y0 + 1.5]), L([CX + 1.6, y0 + 7]), Q([CX, y0 + 9.5], [CX - 1.6, y0 + 7])], true);
  return {
    lines: stroke(polyline([CX, y0], [CX, y1])) + seam(side) + seam(mirrored(side)),
    pull,
  };
}

/* ------------------------------------------------------------------ */
/* Collars                                                              */
/* ------------------------------------------------------------------ */

/**
 * A stand (funnel) collar `h` tall above the shoulder line `y`, around a neck
 * of half width `w`; `shape` is its silhouette, `lines` the topstitch under
 * its edge. Draw it after the body's outline so it covers the neckline.
 */
export function standCollar(w: number, y: number, h: number, round = 3): { shape: string; lines: string; halfW: number } {
  const o = w + 3;
  const top = y - h;
  const shape = symmetric([CX, y + 9], [
    Q([CX + w * 0.7, y + 9], [CX + o, y + 2]),
    L([CX + o, top + round]),
    Q([CX + o, top], [CX + o - round, top]),
    L([CX, top]),
  ]);
  return { shape, lines: seam(polyline([CX - o + 1.5, top + 3.5], [CX + o - 1.5, top + 3.5])), halfW: o };
}

/** The neckline a body wears under `standCollar`, so the collar's bottom edge is its seam. */
export function standNeck(w: number, y: number): { start: Pt; segs: Seg[] } {
  const o = w + 3;
  return { start: [CX, y + 9], segs: [Q([CX + w * 0.7, y + 9], [CX + o, y + 2]), L([CX + o, y])] };
}

export interface FoldCollarSpec {
  /** Half width at the fold, behind the neck. */
  back: number;
  /** Where the leaves meet at center front. */
  meet: Pt;
  /** The collar point. */
  point: Pt;
  /** Control point of the leaf's outer edge. */
  bow: Pt;
  /** y of the throat (bottom of the visible stand). */
  throat: number;
}

/**
 * A folded collar (knit polo collar, spread shirt collar) around a neck of half
 * width `w` on the shoulder line `y`. Same construction as the shirt's point
 * collar, with the leaves' geometry as parameters.
 */
export function foldCollar(w: number, y: number, s: FoldCollarSpec): { fills: string; lines: string } {
  const { back, meet, point, bow, throat } = s;
  const top = y - 7;
  const foldApex = y - 1;
  const foldEnd: Pt = [CX + back, y + 1];
  const collarBack = symmetric([CX, top], [C([CX + back * 0.55, top], [CX + back, top + 3], foldEnd), L([CX, foldApex])]);
  const stand = symmetric([CX, foldApex], [L(foldEnd), C([CX + back, y + 7], [CX + w * 0.6, throat], [CX, throat])]);
  const outer = Q(bow, point);
  const leaf = path(foldEnd, [outer, L(meet), Q([CX + w * 0.75, foldApex + 3], foldEnd)], true);
  const leafEdge = path(foldEnd, [outer, L(meet)]);
  const foldLine = path([CX - back, y + 1], [Q([CX - w * 0.75, foldApex + 3], [2 * CX - meet[0], meet[1]]), L(meet), Q([CX + w * 0.75, foldApex + 3], foldEnd)]);
  return {
    fills: fill(collarBack) + fill(stand) + shade(stand, 0.2) + fill(leaf) + fill(mirrored(leaf)),
    lines:
      stroke(path([CX - back, y + 1], [C([CX - back, top + 3], [CX - back * 0.55, top], [CX, top]), C([CX + back * 0.55, top], [CX + back, top + 3], foldEnd)])) +
      stroke(foldLine) +
      stroke(leafEdge) +
      stroke(mirrored(leafEdge)),
  };
}

/** The plain V a body wears under a fold collar; the fold line covers it. */
export const vNeckUnder = (w: number, y: number): { start: Pt; segs: Seg[] } => ({ start: [CX, y + 14], segs: [L([CX + w, y])] });

/* ------------------------------------------------------------------ */
/* Pockets                                                              */
/* ------------------------------------------------------------------ */

/** A patch pocket with its top-left corner at (x, y), rounded at the bottom. */
export function patchPocket(x: number, y: number, w: number, h: number, r = 3): string {
  return path([x, y], [L([x + w, y]), L([x + w, y + h - r]), Q([x + w, y + h], [x + w - r, y + h]), L([x + r, y + h]), Q([x, y + h], [x, y + h - r])], true);
}

/** A pointed flap `depth` deep over a pocket whose top edge is at (x, y)–(x + w, y). */
export function pocketFlap(x: number, y: number, w: number, depth: number): string {
  return path([x, y - 1], [L([x + w, y - 1]), L([x + w, y + depth * 0.55]), L([x + w / 2, y + depth]), L([x, y + depth * 0.55])], true);
}

/* ------------------------------------------------------------------ */
/* Sleeves for custom bodies                                            */
/* ------------------------------------------------------------------ */

export interface Sleeve {
  /** Segments from the shoulder tip around the sleeve to the armpit `A`. */
  segs: Seg[];
  cuffOuter: Pt;
  cuffInner: Pt;
  dir: Pt;
  /** Both armhole seams. */
  armSeams: string;
  /** Stitch lines across both cuffs, `inset` from the edge. */
  cuffLines(inset: number): string;
  /** The right sleeve as a closed panel. */
  panel: string;
}

/** The kit's sleeve (the same curves `torso()` draws) from shoulder tip `S` to armpit `A`. */
export function sleeve(S: Pt, A: Pt, angle: number, len: number, cuffW: number): Sleeve {
  const u = dir(angle);
  const v = perp(u);
  const Co = add(S, u, len);
  const Ci = add(Co, v, cuffW);
  const top = Q(add(lerp(S, Co, 0.5), v, -1.5), Co);
  const under = Q(add(lerp(Ci, A, 0.5), v, 1.5), A);
  const armSeam = path(S, [C([S[0] - 1, lerp(S, A, 0.4)[1]], [A[0] + 3, A[1] - (A[1] - S[1]) * 0.22], A)]);
  const cuff = (inset: number) => polyline(add(Co, u, -inset), add(Ci, u, -inset));
  return {
    segs: [top, L(Ci), under],
    cuffOuter: Co,
    cuffInner: Ci,
    dir: u,
    armSeams: seam(armSeam) + seam(mirrored(armSeam)),
    cuffLines: (inset) => seam(cuff(inset)) + seam(mirrored(cuff(inset))),
    panel: path(S, [top, L(Ci), under, C([A[0] + 3, A[1] - (A[1] - S[1]) * 0.22], [S[0] - 1, lerp(S, A, 0.4)[1]], S)], true),
  };
}
