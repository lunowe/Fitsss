/**
 * Belts: buckled into a loop and seen from slightly above, the way a belt
 * is shown in a shop, so it fills a square tile and the buckle sits front
 * and center at any size. The band's far side shows inside the loop; the
 * tip passes through the buckle and a keeper and lies on the band.
 * Leather: a prong buckle and holes. Canvas: a box buckle and a metal tip.
 * Web: a pair of D-rings.
 */
import { C, CX, fill, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt } from "../draw";
import type { KitPiece } from "../types";
import { buckle, ellipseArc, metal, roundRect, smooth, splineSegs } from "../parts-feet";

const RX = 88;
const RY = 38;
/** y of the band's top edge at the sides, and the band's height. */
const TOP = 96;
const H = 24;
const BOT = TOP + H;

/** A point on the band's top edge (E1) or bottom edge (E2) at angle `a` (degrees, 0 = right, 90 = front). */
const e1 = (a: number): Pt => [CX + RX * Math.cos((a * Math.PI) / 180), TOP + RY * Math.sin((a * Math.PI) / 180)];
const e2 = (a: number): Pt => [CX + RX * Math.cos((a * Math.PI) / 180), BOT + RY * Math.sin((a * Math.PI) / 180)];
const mid = (a: number): Pt => [e1(a)[0], (e1(a)[1] + e2(a)[1]) / 2];

function loop() {
  const topBack = ellipseArc(CX, TOP, RX, RY, 180, 360, 20);
  const topFront = ellipseArc(CX, TOP, RX, RY, 0, 180, 20);
  const botBack = ellipseArc(CX, BOT, RX, RY, 341, 199, 18);
  const botFront = ellipseArc(CX, BOT, RX, RY, 180, 0, 20);
  // The inside of the loop: the band's far side, seen between its top edge and the front band.
  const inside = path(topBack[0], [...splineSegs(topBack), L(e2(360)), ...splineSegs(ellipseArc(CX, BOT, RX, RY, 360, 180, 20))], true);
  // The near side of the band, from one side round the front to the other.
  const front = path(topFront[0], [...splineSegs(topFront), L(botFront[0]), ...splineSegs(botFront)], true);
  const silhouette = path(topBack[0], [...splineSegs(topBack), L(e2(0)), ...splineSegs(ellipseArc(CX, BOT, RX, RY, 0, 180, 20))], true);
  return {
    inside,
    front,
    silhouette,
    insideEdge: smooth(botBack),
    frontEdge: smooth(topFront),
  };
}

/** The pointed end of the strap lying on the band, from angle `a` back to its point at `tipA`. */
function tip(a: number, tipA: number): string {
  const p = mid(tipA);
  return path(e1(a), [Q([p[0] - 2, e1(tipA)[1] + 2], p), Q([p[0] - 2, e2(tipA)[1] - 2], e2(a))]);
}

/** A keeper: a small loop across the band at angle `a`. */
function keeper(a: number, w = 4): string {
  const d = w / 2.1;
  return path(e1(a + d), [...splineSegs([e1(a + d), e1(a - d)]), L(e2(a - d)), ...splineSegs([e2(a - d), e2(a + d)])], true);
}

/** A hole in the tip at angle `a`. */
const hole = (a: number) => {
  const [x, y] = mid(a);
  return `<circle cx="${Math.round(x * 10) / 10}" cy="${Math.round(y * 10) / 10}" r="1.6" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
};

function leather(): KitPiece {
  const l = loop();
  const bk = buckle(CX, (TOP + BOT) / 2 + RY, 26, H + 7, 3.4);
  const kp = keeper(78);
  const stitchTop = smooth(ellipseArc(CX, TOP + 3, RX, RY, 8, 172, 20));
  const stitchBot = smooth(ellipseArc(CX, BOT - 3, RX, RY, 8, 172, 20));
  return piece({
    base: [fill(l.inside), fill(l.front)],
    lines: [
      shade(l.inside, 0.16),
      ink(stroke(l.silhouette), stroke(l.insideEdge), stroke(l.frontEdge), seam(stitchTop), seam(stitchBot), stroke(tip(58, 50))),
      fill(kp),
      ink(stroke(kp)),
      hole(72), hole(65),
      bk.fills,
      bk.lines,
    ],
    clip: l.inside + l.front,
    extent: [l.silhouette, bk.frame],
  });
}

function canvas(): KitPiece {
  const l = loop();
  // Box buckle at the front, a folded metal tip.
  const cy = (TOP + BOT) / 2 + RY;
  const box = roundRect(CX - 14, cy - H / 2 - 3, 28, H + 6, 2);
  const boxBar = polyline([CX + 2, cy - H / 2 - 1.5], [CX + 2, cy + H / 2 + 1.5]);
  const capA = 62;
  const cap = path(e1(capA + 4), [...splineSegs([e1(capA + 4), e1(capA)]), Q([e1(capA)[0] + 3, mid(capA)[1]], e2(capA)), ...splineSegs([e2(capA), e2(capA + 4)])], true);
  return piece({
    base: [fill(l.inside), fill(l.front)],
    lines: [
      shade(l.inside, 0.16),
      ink(stroke(l.silhouette), stroke(l.insideEdge), stroke(l.frontEdge), seam(smooth(ellipseArc(CX, TOP + 4, RX, RY, 8, 172, 20))), seam(smooth(ellipseArc(CX, BOT - 4, RX, RY, 8, 172, 20)))),
      metal(cap),
      ink(stroke(cap)),
      metal(box),
      ink(stroke(box), stroke(boxBar)),
    ],
    clip: l.inside + l.front,
    extent: [l.silhouette, box],
  });
}

/** A D-ring standing on the band: a metal annulus. */
function dRing(cx: number, cy: number, r: number): string {
  const circle = (rad: number) => path([cx - rad, cy], [C([cx - rad, cy - rad * 1.33], [cx + rad, cy - rad * 1.33], [cx + rad, cy]), C([cx + rad, cy + rad * 1.33], [cx - rad, cy + rad * 1.33], [cx - rad, cy])], true);
  const ringStroke = (rad: number) => `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  return metal(circle(r) + circle(r - 2.4)) + ringStroke(r) + ringStroke(r - 2.4);
}

function web(): KitPiece {
  const l = loop();
  const cy = (TOP + BOT) / 2 + RY;
  const capA = 62;
  const cap = path(e1(capA + 4), [...splineSegs([e1(capA + 4), e1(capA)]), Q([e1(capA)[0] + 3, mid(capA)[1]], e2(capA)), ...splineSegs([e2(capA), e2(capA + 4)])], true);
  return piece({
    base: [fill(l.inside), fill(l.front)],
    lines: [
      shade(l.inside, 0.16),
      ink(stroke(l.silhouette), stroke(l.insideEdge), stroke(l.frontEdge), stroke(smooth(ellipseArc(CX, TOP + 8, RX, RY, 8, 172, 20))), stroke(smooth(ellipseArc(CX, BOT - 8, RX, RY, 8, 172, 20)))),
      metal(cap),
      ink(stroke(cap)),
      dRing(CX - 6, cy, H / 2 + 3.5),
      dRing(CX + 5, cy, H / 2 + 3.5),
    ],
    clip: l.inside + l.front,
    extent: [l.silhouette, roundRect(CX - 22, cy - H / 2 - 4, 44, H + 8, 1)],
  });
}

export const BELT: Record<string, KitPiece> = {
  "belt~leather": leather(),
  "belt~canvas": canvas(),
  "belt~web": web(),
};
BELT["belt"] = BELT["belt~leather"];
