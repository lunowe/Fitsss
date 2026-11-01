/**
 * Caps, side view, brim to the right, so crown height, brim curve and
 * closure read at a glance: a baseball cap's structured crown, a dad cap's
 * slumped crown and strap, a five-panel's flat front and short brim, a
 * trucker's tall foam front and mesh back.
 */
import { C, FILL2, fill, ink, L, path, piece, polyline, Q, seam, shade, stroke, type Pt, type Seg } from "../draw";
import type { KitPiece } from "../types";
import { disc, eyelet, roundRect } from "../parts-feet";

const BACK = 42;
const FRONT = 136;
const BOTTOM = 100;

interface CapSpec {
  /** Segments of the crown from the back-bottom corner over the top to the front-bottom corner. */
  crown: Seg[];
  /** Where the brim's tip sits. */
  brimTip: Pt;
  /** Brim curve: how far its underside bows below a straight brim. */
  brimCurve: number;
  /** Extra detail in the lines layer. */
  details: string[];
  /** Things drawn before the crown's ink (fills in the second color). */
  trims?: string[];
  /** Logo and graphic anchors. */
  logo: readonly [number, number, number];
  graphic: readonly [number, number, number];
}

function cap(spec: CapSpec): KitPiece {
  const front: Pt = [FRONT, BOTTOM - 4];
  const crown = path([BACK, BOTTOM], [...spec.crown, L(front), Q([90, BOTTOM + 3], [BACK, BOTTOM])], true);
  const { brimTip, brimCurve } = spec;
  // The brim: a wedge, thick at the crown, tapering to a rounded tip, bowing down a little.
  const tipTop: Pt = [brimTip[0] - 1.5, brimTip[1] - 2.2];
  const tipBottom: Pt = [brimTip[0] - 2.5, brimTip[1] + 1.6];
  const brim = path([FRONT - 4, BOTTOM - 12], [
    C([FRONT + 16, BOTTOM - 12 + brimCurve * 0.3], [brimTip[0] - 16, brimTip[1] - 5 - brimCurve * 0.2], tipTop),
    Q([brimTip[0] + 1.5, brimTip[1]], tipBottom),
    C([brimTip[0] - 16, brimTip[1] + 2 + brimCurve * 0.15], [FRONT + 18, BOTTOM + 2 + brimCurve * 0.5], [FRONT - 4, BOTTOM + 1.5]),
  ], true);
  const sweatband = path([BACK + 4, BOTTOM - 3.5], [Q([90, BOTTOM - 0.5], [FRONT - 4, BOTTOM - 7])]);
  return piece({
    base: [fill(crown)],
    lines: [
      fill(brim),
      shade(brim, 0.1),
      ...(spec.trims ?? []),
      ink(stroke(crown), stroke(brim), seam(sweatband), ...spec.details),
    ],
    clip: crown,
    extent: [crown, brim],
    logo: spec.logo,
    graphic: spec.graphic,
  });
}

/** The top button and the two panel seams running down from it. */
function panels(apex: Pt, backFoot: Pt, frontFoot: Pt): { fills: string; lines: string[] } {
  return {
    fills: disc(apex[0], apex[1], 2.6, FILL2) + `<circle cx="${apex[0]}" cy="${apex[1]}" r="2.6" fill="none" stroke="var(--icon-stroke, #000)" stroke-width="1" vector-effect="non-scaling-stroke"/>`,
    lines: [
      seam(path(apex, [C([apex[0] - 10, apex[1] + 10], [backFoot[0] - 2, backFoot[1] - 30], backFoot)])),
      seam(path(apex, [C([apex[0] + 14, apex[1] + 12], [frontFoot[0] + 1, frontFoot[1] - 30], frontFoot)])),
    ],
  };
}

function baseball(): KitPiece {
  const apex: Pt = [92, 40];
  const p = panels(apex, [64, BOTTOM - 2], [126, BOTTOM - 4]);
  return cap({
    crown: [C([36, 78], [46, 50], [66, 44]), C([76, 40], [84, 39], apex), C([108, 39], [128, 44], [134, 62]), C([137, 74], [137, 86], [FRONT, BOTTOM - 4])],
    brimTip: [186, 100],
    brimCurve: 6,
    trims: [p.fills],
    details: [...p.lines, eyelet([96, 62], 1.5)],
    logo: [100, 76, 18],
    graphic: [100, 74, 30],
  });
}

function dad(): KitPiece {
  const apex: Pt = [90, 52];
  const p = panels(apex, [64, BOTTOM - 2], [124, BOTTOM - 4]);
  // Unstructured: the crown slumps, and an adjustable strap pokes out the back.
  const strap = roundRect(26, 90, 18, 6, 1.5);
  const slider = roundRect(27, 88, 6, 10, 1.5);
  return cap({
    crown: [C([38, 82], [48, 60], [66, 56]), C([76, 52], [84, 51], apex), C([108, 52], [126, 56], [132, 68]), C([136, 78], [137, 88], [FRONT, BOTTOM - 4])],
    brimTip: [184, 104],
    brimCurve: 10,
    trims: [fill(strap), shade(strap, 0.1), p.fills],
    details: [...p.lines, eyelet([96, 70], 1.5), stroke(strap), stroke(slider)],
    logo: [100, 80, 18],
    graphic: [100, 79, 28],
  });
}

function fivePanel(): KitPiece {
  // A flat front panel, a flatter top, a short straight brim.
  const frontTop: Pt = [130, 46];
  const panel = path([frontTop[0] - 6, frontTop[1] + 3], [Q([frontTop[0] - 6, 76], [frontTop[0] - 3, BOTTOM - 5])]);
  const sideTop = path([58, 56], [Q([92, 49], [frontTop[0] - 6, frontTop[1] + 3])]);
  return cap({
    crown: [C([36, 82], [38, 56], [56, 50]), Q([92, 42], frontTop), C([137, 52], [138, 76], [FRONT, BOTTOM - 4])],
    brimTip: [178, 98],
    brimCurve: 2.5,
    details: [seam(panel), seam(sideTop)],
    logo: [116, 74, 16],
    graphic: [113, 74, 28],
  });
}

function trucker(): KitPiece {
  // A tall foam front, mesh back panels, a snap closure.
  const frontTop: Pt = [128, 40];
  const meshEdge: Pt = [92, 42];
  const mesh = path([BACK, BOTTOM], [C([36, 78], [46, 52], [70, 44]), Q([80, 42], meshEdge), L([90, BOTTOM - 1]), Q([66, BOTTOM + 1], [BACK, BOTTOM])], true);
  const snap = polyline([BACK + 3, 86], [BACK + 14, 86]);
  return cap({
    crown: [C([36, 78], [46, 52], [70, 44]), Q([80, 42], meshEdge), Q([112, 36], frontTop), C([136, 44], [138, 72], [FRONT, BOTTOM - 4])],
    brimTip: [186, 101],
    brimCurve: 7,
    trims: [fill(mesh, FILL2), shade(mesh, 0.06)],
    details: [stroke(path(meshEdge, [L([90, BOTTOM - 1])])), ...meshLines(), seam(snap)],
    logo: [112, 70, 18],
    graphic: [110, 70, 30],
  });
}

/** A diamond mesh across the back panels, clipped by hand to the panel's inside. */
function meshLines(): string[] {
  const inside = (x: number, y: number) => y >= 50 && y <= BOTTOM - 5 && x <= 87 && x >= 47 + Math.max(0, 78 - y) * 0.5;
  const out: string[] = [];
  const pitch = 9;
  for (const dirn of [1, -1]) {
    for (let c = -120; c < 200; c += pitch) {
      // Line x - dirn*y = c, walked in y.
      let run: Pt[] = [];
      const flush = () => {
        if (run.length >= 2) out.push(seam(polyline(run[0], run[run.length - 1])));
        run = [];
      };
      for (let y = 48; y <= BOTTOM - 3; y += 0.5) {
        const x = c + dirn * y;
        if (inside(x, y)) run.push([x, y]);
        else flush();
      }
      flush();
    }
  }
  return out;
}

export const CAP: Record<string, KitPiece> = {
  "cap~baseball": baseball(),
  "cap~dad": dad(),
  "cap~five-panel": fivePanel(),
  "cap~trucker": trucker(),
};
CAP["cap"] = CAP["cap~baseball"];
