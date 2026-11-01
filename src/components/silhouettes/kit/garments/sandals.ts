/**
 * Sandals, the lowest shoes in the family, seen from the side and the same
 * touch from above as every other shoe, toe right: the footbed shows as a
 * narrow lens over the sole's edge (the way a collar shows its inside), and
 * each variant's straps rise from the near edge and land on the far edge.
 * Through a strap's arch shows its far wall in shadow, so a band over a
 * footbed is a loop a foot goes through and not a solid dome. The straps are
 * the garment: they carry the color and the pattern clip.
 */
import { C, fill, FILL2, ink, L, path, piece, polyline, seam, shade, stroke, type Pt, type Seg } from "../draw";
import type { KitPiece } from "../types";
import { buckle, footSole, GROUND, MOUTH, reversed, sampleCubic, smooth, splineSegs, type Sole } from "../parts-feet";

const X0 = 22;
const X1 = 184;

/**
 * The footbed's top surface: the far edge rises `rise` above the ground line
 * in the middle of the foot and falls to the toe. `far(x)` is that edge.
 */
function footbedTop(s: Sole, rise: number) {
  const cx = (X0 + X1) / 2;
  const rx = (X1 - X0) / 2;
  const spring = GROUND - s.toe[1];
  const far = (x: number): number => {
    const u = Math.max(-1, Math.min(1, (x - cx) / rx));
    const lift = Math.sqrt(1 - u * u) * rise;
    // Flatter in the middle than a true ellipse, and lifted at the toe with the sole.
    return GROUND - lift * (0.82 + 0.18 * (1 - u * u)) - spring * Math.max(0, u) ** 3;
  };
  const pts: Pt[] = [];
  const n = 24;
  for (let i = 1; i < n; i++) pts.push([X0 + ((X1 - X0) * i) / n, far(X0 + ((X1 - X0) * i) / n)]);
  const edgeSegs = splineSegs([[X0, GROUND], ...pts, s.toe]);
  const d = path([X0, GROUND], [...edgeSegs, ...s.topBack], true);
  /** The far edge as ink, except where a strap's band covers it. */
  const edge = (hidden: readonly (readonly [number, number])[]): string[] => {
    const spans: [number, number][] = [];
    let x = X0;
    for (const [h0, h1] of [...hidden].sort((p, q) => p[0] - q[0])) {
      if (h0 > x) spans.push([x, h0]);
      x = Math.max(x, h1);
    }
    if (x < X1) spans.push([x, X1]);
    return spans.map(([x0, x1]) => {
      const n = Math.max(2, Math.round((x1 - x0) / 7));
      const run: Pt[] = [];
      for (let i = 0; i <= n; i++) {
        const xi = x0 + ((x1 - x0) * i) / n;
        run.push([xi, xi <= X0 + 0.01 ? GROUND : far(xi)]);
      }
      return stroke(smooth(run));
    });
  };
  return {
    far,
    // The surface in the second color, toned like every opening in the family.
    fills: fill(d, FILL2) + shade(d, 0.14),
    edge,
    path: d,
  };
}

/**
 * The segments of an arch from (x0, y0) up to a flat top at `top` and down to
 * (x1, y1); `s` is the run of each side, and `lean` moves run from the front
 * side to the back one (a strap over an instep slopes more behind the foot).
 */
function arch(x0: number, x1: number, top: number, s: number, y0: number, y1: number, lean = 0): Seg[] {
  const r = Math.min(8, (x1 - x0) / 4);
  const sb = s * (1 + lean);
  const sf = s * (1 - lean);
  return [
    C([x0 + sb * 0.45, top + (y0 - top) * 0.5], [x0 + sb * 0.8, top], [x0 + sb + r, top]),
    L([x1 - sf - r, top]),
    C([x1 - sf * 0.8, top], [x1 - sf * 0.45, top + (y1 - top) * 0.5], [x1, y1]),
  ];
}

/** x where the left leg of `arch(x0, …, s, y0, …)` reaches height y (sampled along its first curve). */
function legCross(x0: number, top: number, s: number, y0: number, y: number): number {
  const seg = arch(x0, x0 + 100, top, s, y0, y0)[0] as readonly ["C", Pt, Pt, Pt];
  const pts = sampleCubic([x0, y0], seg[1], seg[2], seg[3], 24);
  for (let i = 1; i < pts.length; i++) if (pts[i][1] <= y) return pts[i][0];
  return x0 + s;
}

/**
 * A strap over the footbed, seen a touch from above: its near edge is an
 * arch rising from the ground line at x = a and x = b, `h` high; its far
 * edge is a second arch `d` higher on screen whose feet stand on the
 * footbed's far edge, `inset` in from the near feet and `shift` to the right.
 * The band (the strap's top surface) lies between the two arches; through
 * the near arch show the strap's far wall and the footbed. `hidden` are the
 * spans of the footbed's far edge the band covers.
 */
function strap(far: (x: number) => number, a: number, b: number, h: number, d: number, shoulder = 12, farShoulder = shoulder * 1.4, inset = 8, shift = 5, lean = 0) {
  const Y = GROUND;
  const ia = a + inset + shift;
  const ib = b - inset + shift;
  const nearSegs = arch(a, b, Y - h, shoulder, Y, Y, lean);
  const farSegs = arch(ia, ib, Y - h - d, farShoulder, far(ia), far(ib), lean);
  const near = path([a, Y], nearSegs);
  const farArch = path([ia, far(ia)], farSegs);
  const band = path([ia, far(ia)], [...farSegs, L([b, Y]), ...reversed(nearSegs, [a, Y])], true);
  // The far edge between the far feet, as a curve along the footbed.
  const farPts: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const x = ib - ((ib - ia) * i) / 6;
    farPts.push([x, far(x)]);
  }
  const underside = path([ia, far(ia)], [...farSegs, ...splineSegs(farPts)], true);
  const crossA = legCross(a, Y - h, shoulder * (1 + lean), Y, far(a + 2));
  const crossB = 2 * b - legCross(b, Y - h, shoulder * (1 - lean), Y, far(b - 2));
  // A stitch line inset from the far (top) edge of the band.
  const edge = (k: number) => path([ia + k * 0.6, far(ia) - 1], arch(ia + k * 0.6, ib - k * 0.6, Y - h - d + k, farShoulder * 0.9, far(ia) - 1, far(ib) - 1, lean));
  return { band, underside, near, farArch, edge, hidden: [[Math.min(crossA, ia), ia], [ib, Math.max(crossB, ib)]] as [number, number][] };
}

/** The strap's far wall, seen through the arch: the garment color in the family's opening tone. */
const through = (underside: string) => fill(underside) + shade(underside, MOUTH + 0.06);

type Strap = ReturnType<typeof strap>;
type Bed = ReturnType<typeof footbedTop>;

/** The fabric layer of a sandal: far walls, then the footbed, then the bands over both. */
const sandalBase = (bed: Bed, straps: Strap[]) => [...straps.map((t) => through(t.underside)), bed.fills, ...straps.map((t) => fill(t.band))];

/** The ink of the straps and the footbed's far edge around them. */
const sandalInk = (bed: Bed, straps: Strap[], ...extra: string[]) =>
  ink(...bed.edge(straps.flatMap((t) => t.hidden)), ...straps.flatMap((t) => [stroke(t.farArch), stroke(t.band)]), ...extra);

function slide(): KitPiece {
  // A thick molded footbed, higher at the heel, and one broad band over the
  // instep with steep sides: the band is most of the drawing, so it reads at
  // grid size, and the dark far wall through it says "loop".
  const s = footSole({ x0: X0, x1: X1, depth: 12, spring: 4, heelLift: 8, midsole: true });
  const bed = footbedTop(s, 6.5);
  const a = strap(bed.far, 74, 144, 23, 7, 16, 17, 6, 4, 0.25);
  return piece({
    base: sandalBase(bed, [a]),
    lines: [s.fills, sandalInk(bed, [a], seam(a.edge(3.5))), s.lines],
    clip: a.band,
    extent: [a.band, s.path, bed.path],
  });
}

function strappy(): KitPiece {
  const s = footSole({ x0: X0, x1: X1, depth: 9, spring: 3, midsole: true });
  const bed = footbedTop(s, 6);
  const toe = strap(bed.far, 138, 172, 11, 4, 5, 6, 4, 3);
  const instep = strap(bed.far, 82, 128, 18, 5.5, 7, 9, 5, 4);
  // Ankle strap: runs back from the instep strap and wraps the heel, buckled on the side.
  const ankle = path([96, 91], [
    C([80, 91], [52, 91], [36, 89]),
    C([27, 88], [23, 96], [22, GROUND - 8]),
    L([28, GROUND - 8]),
    C([29, 100], [32, 95], [38, 95]),
    C([54, 96], [80, 97.5], [96, 97.5]),
  ], true);
  const b = buckle(60, 93.5, 7, 9, 2.4);
  return piece({
    base: [...sandalBase(bed, [toe, instep]), fill(ankle)],
    lines: [
      s.fills,
      sandalInk(bed, [toe, instep], stroke(ankle)),
      b.fills,
      b.lines,
      s.lines,
    ],
    clip: toe.band + instep.band + ankle,
    extent: [toe.band, instep.band, ankle, s.path, bed.path],
  });
}

function flipFlop(): KitPiece {
  const s = footSole({ x0: X0, x1: X1, depth: 8, spring: 3, midsole: true });
  const bed = footbedTop(s, 6);
  // The thong: a post standing on the footbed near the toe, a strap running
  // back over the foot to the near edge and another to the far edge.
  const post: Pt = [146, 109];
  const knot: Pt = [142, 97];
  const near = path([knot[0] - 4, knot[1] - 4], [
    C([120, 82], [96, 88], [78, 104]),
    C([74, 108], [72, 113], [71, GROUND]),
    L([82, GROUND]),
    C([83, 112], [86, 106], [92, 102]),
    C([108, 94], [126, 96], [knot[0] + 2, knot[1] + 4]),
  ], true);
  const farY = bed.far(96);
  const farStrap = path([knot[0] - 3, knot[1] - 2], [
    C([126, 88], [108, 90], [96, farY - 4]),
    L([104, farY + 1]),
    C([114, 96], [128, 94], [knot[0] + 1, knot[1] + 5]),
  ], true);
  const postD = path([knot[0] - 3.5, knot[1]], [L([knot[0] + 3.5, knot[1]]), L([post[0] + 2.5, post[1]]), L([post[0] - 2.5, post[1]])], true);
  return piece({
    base: [fill(farStrap), shade(farStrap, MOUTH + 0.06), bed.fills, fill(postD), fill(near)],
    lines: [s.fills, ink(...bed.edge([[92, 106]]), stroke(farStrap), stroke(postD), stroke(near)), s.lines],
    clip: near + farStrap + postD,
    extent: [near, s.path, bed.path],
  });
}

function cork(): KitPiece {
  const s = footSole({ x0: X0, x1: X1, depth: 14, spring: 3, heelLift: 3, midsole: true });
  const bed = footbedTop(s, 6.5);
  const back = strap(bed.far, 68, 132, 20, 6.5, 8, 10, 6, 4);
  const front = strap(bed.far, 138, 180, 14, 5, 6, 7, 5, 3);
  const b1 = buckle(84, 100, 7, 9, 2.4);
  const b2 = buckle(146, 106, 7, 9, 2.4);
  // The cork's edge: a second line just under the ground line.
  const corkLine = polyline([X0 + 2, GROUND + 4], [X1 - 2, GROUND + 3]);
  return piece({
    base: sandalBase(bed, [back, front]),
    lines: [
      s.fills,
      sandalInk(bed, [back, front], seam(corkLine)),
      b1.fills,
      b1.lines,
      b2.fills,
      b2.lines,
      s.lines,
    ],
    clip: back.band + front.band,
    extent: [back.band, front.band, s.path, bed.path],
  });
}

export const SANDALS: Record<string, KitPiece> = {
  "sandals~slide": slide(),
  "sandals~strap": strappy(),
  "sandals~flip-flop": flipFlop(),
  "sandals~cork": cork(),
};
SANDALS["sandals"] = SANDALS["sandals~slide"];
