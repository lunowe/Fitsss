/**
 * Shared parts for the tops, layers and full-body group: rib trims, plackets,
 * zips, stand and fold collars, pockets, and a sleeve builder for bodies that
 * `torso()` cannot describe (dresses, jumpsuits). Everything here follows the
 * kit's one-line language: trims in FILL2, seams at SEAM, hardware as buttons.
 */
import { add, button, C, CX, dir, FILL2, fill, L, lerp, mirrored, path, perp, polyline, Q, seam, shade, stroke, symmetric, type Pt, type Seg } from "./draw";
import { sleevePanelsOf } from "./parts-outer";
import type { Torso, TorsoSpec } from "./torso";
import type { ArtPanel } from "./types";

/* ------------------------------------------------------------------ */
/* Fits                                                                 */
/* ------------------------------------------------------------------ */

type TorsoDims = Omit<TorsoSpec, "neck">;

/**
 * One fit table for every top, applied as deltas to a garment's regular
 * block, so a tee, a sweater and an overshirt grow the same way and every
 * step reads on its own at 96 px without its caption. Width alone does not
 * separate neighbours at that size (a step of 8 units is 3 px), so each step
 * also changes the construction:
 *
 *   fitted     cut close: the seam on the shoulder point, a high and narrow
 *              armhole, a waist pulled in and a hem that eases back out,
 *              short narrow sleeves hugging the arm, a touch shorter
 *   regular    a straight body with a standard set-in sleeve
 *   relaxed    the shoulder seam dropped off the shoulder, a fuller and
 *              longer sleeve that droops, a wider straight body, longer
 *   oversized  the shoulder seam well down the arm, a wide body, long wide
 *              sleeves, long
 *   boxy       as wide as oversized with a dropped shoulder, cropped square
 *
 * Sleeve deltas scale with the sleeve, so short and long sleeves grow alike;
 * a sleeve's top width (`sleeveW`) grows with its cuff, and the gap a long
 * sleeve hangs from the body (`hang`) grows with the room in the body.
 */
export function topFit<T extends TorsoDims>(base: T, fit: string): T {
  const short = base.sleeveAngle < 50;
  const r = Math.round;
  const sleeve = (len: number, cuff: number, w: number, angle: number, hang: number) => ({
    sleeveLen: r(base.sleeveLen * len),
    cuffW: r(base.cuffW * cuff),
    ...(base.sleeveW === undefined ? {} : { sleeveW: r(base.sleeveW * w) }),
    ...(base.hang === undefined ? {} : { hang }),
    sleeveAngle: base.sleeveAngle + angle,
  });
  switch (fit) {
    case "fitted": {
      const chestW = base.chestW - 10;
      return {
        ...base,
        shoulderW: base.shoulderW - 9,
        chestW,
        waistW: chestW - 8,
        hemW: chestW - 4,
        length: base.length - 10,
        armhole: base.armhole - 7,
        ...sleeve(short ? 0.8 : 0.97, short ? 0.66 : 0.74, 0.72, short ? 12 : 0, 1),
      };
    }
    case "relaxed":
      return {
        ...base,
        shoulderW: base.shoulderW + 12,
        shoulderDrop: base.shoulderDrop + 4,
        chestW: base.chestW + 11,
        waistW: base.waistW === undefined ? undefined : base.waistW + 11,
        hemW: base.hemW + 11,
        length: base.length + 14,
        armhole: base.armhole + 8,
        ...sleeve(short ? 1.25 : 1.08, 1.3, 1.26, short ? 6 : 0, 3.5),
      };
    case "oversized":
      return {
        ...base,
        shoulderW: base.shoulderW + 24,
        shoulderDrop: base.shoulderDrop + 12,
        chestW: base.chestW + 23,
        waistW: undefined,
        hemW: base.hemW + 22,
        length: base.length + 30,
        armhole: base.armhole + 16,
        ...sleeve(short ? 1.4 : 1.17, 1.6, 1.52, short ? 14 : -2, 4.5),
      };
    case "boxy":
      return {
        ...base,
        shoulderW: base.shoulderW + 20,
        shoulderDrop: base.shoulderDrop + 7,
        chestW: base.chestW + 20,
        waistW: undefined,
        hemW: base.chestW + 20,
        length: base.length - 18,
        armhole: base.armhole + 13,
        ...sleeve(short ? 1.2 : 1.03, 1.45, 1.4, short ? 4 : -1, 3.5),
      };
    default:
      return { ...base };
  }
}

/* ------------------------------------------------------------------ */
/* Print anchors                                                        */
/* ------------------------------------------------------------------ */

export type Anchor = readonly [number, number, number];

/**
 * Where a chest logo and a front print sit on a top. The logo is on the
 * wearer's left chest (the viewer's right), just below the armpit line,
 * about 23% of the chest width across so the mark still reads in a closet
 * tile; the print is centered below the neckline, about half the chest
 * width, shrunk when the body is too short for it (a boxy crop).
 * `top`/`bottom` bound the print area (default: the armpit line to just
 * above the hem); `logoX` moves the logo as a fraction of the half chest,
 * `logoY` sets its center line.
 */
export function chestAnchors(t: Torso, opts: { top?: number; bottom?: number; logoX?: number; logoY?: number } = {}): { logo: Anchor; graphic: Anchor } {
  const { chestW, length } = t.spec;
  const chest = chestW * 2;
  const armpitY = t.armpit[1];
  const top = opts.top ?? armpitY - 4;
  const bottom = opts.bottom ?? length - 10;
  const logoSize = Math.round(chest * 0.2);
  const graphicSize = Math.min(Math.round(chest * 0.5), Math.round((bottom - top) * 0.72));
  return {
    logo: [Math.round(CX + chestW * (opts.logoX ?? 0.4)), Math.round(opts.logoY ?? armpitY + 6), logoSize],
    graphic: [CX, Math.round((top + 6 + graphicSize / 2) * 10) / 10, graphicSize],
  };
}

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
  /** Pattern panels for both sleeves: a field pattern turns to run along each arm. */
  panels: ArtPanel[];
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
  const panel = path(S, [top, L(Ci), under, C([A[0] + 3, A[1] - (A[1] - S[1]) * 0.22], [S[0] - 1, lerp(S, A, 0.4)[1]], S)], true);
  return {
    segs: [top, L(Ci), under],
    cuffOuter: Co,
    cuffInner: Ci,
    dir: u,
    armSeams: seam(armSeam) + seam(mirrored(armSeam)),
    cuffLines: (inset) => seam(cuff(inset)) + seam(mirrored(cuff(inset))),
    panel,
    panels: sleevePanelsOf(panel, angle),
  };
}
