/**
 * Scarves, front view. The knit and wool scarves hang folded in half, the
 * loop at the top and two tails with fringe; the knit one shows its ribs and
 * is narrower, the wool one is wider and plain. The silk scarf is a square
 * folded on the diagonal, lying flat with a soft hem. Patterns run across
 * the tails.
 */
import { C, CX, fill, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";

/** Rib lines are quieter than seams so a pattern stays on top. */
const RIB = 0.32;

interface HungSpec {
  /** Width of one tail. */
  tailW: number;
  /** Gap between the tails at the bottom. */
  gap: number;
  /** y of the bottom of the longer tail. */
  bottom: number;
  /** Rib lines per tail. */
  ribs: number;
  /** Fringe length. */
  fringe: number;
}

/** A scarf folded in half and hung: the loop above, the two tails below. */
function hung(spec: HungSpec): KitPiece {
  const { tailW, gap, bottom, ribs, fringe } = spec;
  const top = 22;
  const loopH = 34;
  const xL = CX - gap / 2 - tailW; // left tail's outer edge
  const xR = CX + gap / 2 + tailW;
  const bottomL = bottom;
  const bottomR = bottom - 14;
  // Outline: left tail up into the loop, over, down the right tail.
  const outline = path([xL, bottomL], [
    L([xL, top + loopH]),
    C([xL, top + loopH * 0.3], [xL + tailW * 0.4, top], [CX, top]),
    C([xR - tailW * 0.4, top], [xR, top + loopH * 0.3], [xR, top + loopH]),
    L([xR, bottomR]),
    L([xR - tailW, bottomR]),
    L([xR - tailW, top + loopH + 10]),
    Q([CX, top + loopH + 2], [xL + tailW, top + loopH + 10]),
    L([xL + tailW, bottomL]),
  ], true);
  // The inside of the loop: the back of the scarf seen through the fold.
  const inner = path([xL + tailW, top + loopH + 10], [
    Q([CX, top + loopH + 2], [xR - tailW, top + loopH + 10]),
    L([xR - tailW, top + loopH]),
    Q([CX, top + loopH - 8], [xL + tailW, top + loopH]),
  ], true);
  const ribLines: string[] = [];
  for (let i = 1; i <= ribs; i++) {
    const t = i / (ribs + 1);
    ribLines.push(stroke(polyline([xL + tailW * t, top + loopH + 10 - t * 3], [xL + tailW * t, bottomL - 1.5]), RIB));
    ribLines.push(stroke(polyline([xR - tailW + tailW * t, top + loopH + 10 - (1 - t) * 3], [xR - tailW + tailW * t, bottomR - 1.5]), RIB));
    // Ribs continue over the loop.
    const lx = xL + tailW * t;
    const rx = xR - tailW * (1 - t);
    ribLines.push(stroke(path([lx, top + loopH], [C([lx, top + loopH * 0.3 + t * 6], [lx + tailW * 0.4, top + t * 10], [CX, top + t * 10])]), RIB));
    ribLines.push(stroke(path([rx, top + loopH], [C([rx, top + loopH * 0.3 + (1 - t) * 6], [rx - tailW * 0.4, top + (1 - t) * 10], [CX, top + (1 - t) * 10])]), RIB));
  }
  // Fringe: thin filled strands, so they show on dark pieces too.
  const fringeFills: string[] = [];
  const fringes: string[] = [];
  const count = Math.max(3, Math.round(tailW / 6.5));
  const strand = (x: number, y: number, lean: number) => path([x - 1.1, y], [L([x + 1.1, y]), L([x + lean + 0.6, y + fringe]), L([x + lean - 0.6, y + fringe])], true);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const dx = 2 + (tailW - 4) * t;
    const lean = (t - 0.5) * 2.5;
    fringeFills.push(fill(strand(xL + dx, bottomL, lean)), fill(strand(xR - tailW + dx, bottomR, lean)));
    fringes.push(stroke(strand(xL + dx, bottomL, lean)), stroke(strand(xR - tailW + dx, bottomR, lean)));
  }
  const hemL = polyline([xL + 1.5, bottomL - 4], [xL + tailW - 1.5, bottomL - 4]);
  const hemR = polyline([xR - tailW + 1.5, bottomR - 4], [xR - 1.5, bottomR - 4]);
  return piece({
    base: [fill(outline)],
    lines: [
      fill(inner),
      shade(inner, 0.22),
      ...fringeFills,
      ink(stroke(outline), stroke(path([xL + tailW, top + loopH], [Q([CX, top + loopH - 8], [xR - tailW, top + loopH])])), ...ribLines, seam(hemL), seam(hemR), ...fringes),
    ],
    clip: outline,
    extent: [outline, polyline([xL, bottomL + fringe], [xR, bottomL + fringe])],
    stripe: "h",
  });
}

/** A silk square folded on the diagonal, lying flat. */
function silk(): KitPiece {
  const w = 86; // half width of the fold
  const top = 44;
  const point: Pt = [CX + 6, 178];
  const outline = path([CX - w, top], [
    // The fold: a straight top edge with the slightest sag.
    Q([CX, top + 4], [CX + w, top]),
    // Right hem drapes down to the point.
    C([CX + w - 10, top + 40], [CX + 30, point[1] - 30], point),
    C([CX - 14, point[1] - 22], [CX - w + 6, top + 50], [CX - w, top]),
  ], true);
  // The under layer peeks out along the right hem: the folded second half.
  const under = path([CX + w, top], [
    C([CX + w + 2, top + 34], [CX + 40, point[1] - 24], [point[0] + 8, point[1] + 4]),
    L(point),
    C([CX + 30, point[1] - 30], [CX + w - 10, top + 40], [CX + w, top]),
  ], true);
  const hem = path([CX - w + 5, top + 4], [C([CX - w + 10, top + 50], [CX - 12, point[1] - 24], [point[0] - 2, point[1] - 5])]);
  const hem2 = path([point[0] - 2, point[1] - 5], [C([CX + 28, point[1] - 32], [CX + w - 14, top + 40], [CX + w - 5, top + 4])]);
  // A soft crease across the fold.
  const crease = path([CX - 30, top + 30], [Q([CX + 4, top + 60], [CX + 40, top + 110])]);
  return piece({
    base: [fill(outline)],
    lines: [fill(under), shade(under, 0.18), ink(stroke(under), stroke(outline), seam(hem), seam(hem2), seam(crease))],
    clip: outline,
    extent: [outline, under],
    stripe: "h",
  });
}

export const SCARF: Record<string, KitPiece> = {
  "scarf~knit-scarf": hung({ tailW: 30, gap: 12, bottom: 176, ribs: 3, fringe: 10 }),
  "scarf~wool-scarf": hung({ tailW: 38, gap: 10, bottom: 180, ribs: 0, fringe: 9 }),
  "scarf~silk-scarf": silk(),
};
SCARF["scarf"] = SCARF["scarf~knit-scarf"];
