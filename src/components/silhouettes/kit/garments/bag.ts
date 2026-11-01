/**
 * Bags, front view, handles and straps up. Backpack: a tall rounded body
 * with a front pocket, grab handle and the shoulder straps peeking out at
 * the sides. Crossbody: a small flap bag under a long thin strap. Messenger:
 * a wide flap bag with two buckle straps and a wide shoulder strap. Duffel:
 * a barrel with its end seams, a top zip and two carry handles.
 */
import { button, C, CX, FILL2, fill, ink, L, mirrored, path, piece, polyline, Q, seam, shade, stroke, symmetric } from "../draw";
import type { KitPiece } from "../types";
import { buckle, ring, roundRect } from "../parts-feet";

/** A strap arching from (CX ± at, y) up to `apex`, `w` wide. */
function loop(at: number, apex: number, w: number, y: number, lean = 0.6): string {
  const o = at + w / 2;
  const i = at - w / 2;
  return path([CX - o, y], [
    C([CX - o, apex + (y - apex) * 0.1], [CX - o * lean, apex], [CX, apex]),
    C([CX + o * lean, apex], [CX + o, apex + (y - apex) * 0.1], [CX + o, y]),
    L([CX + i, y]),
    C([CX + i, apex + w + (y - apex - w) * 0.1], [CX + i * lean, apex + w], [CX, apex + w]),
    C([CX - i * lean, apex + w], [CX - i, apex + w + (y - apex - w) * 0.1], [CX - i, y]),
  ], true);
}

function backpack(): KitPiece {
  const top = 36;
  const bottom = 188;
  const w = 58;
  const body = symmetric([CX, top], [
    C([CX + w * 0.6, top], [CX + w, top + 20], [CX + w, top + 44]),
    L([CX + w, bottom - 8]),
    Q([CX + w, bottom], [CX + w - 8, bottom]),
    L([CX, bottom]),
  ]);
  // Front pocket: the lower third, with a zip across its top.
  const pTop = bottom - 66;
  const pocket = symmetric([CX, pTop], [L([CX + w - 12, pTop]), Q([CX + w - 6, pTop], [CX + w - 6, pTop + 6]), L([CX + w - 6, bottom - 10]), Q([CX + w - 6, bottom - 5], [CX + w - 11, bottom - 5]), L([CX, bottom - 5])]);
  const zip = polyline([CX - w + 10, pTop + 1], [CX + w - 10, pTop + 1]);
  const zipTeeth = polyline([CX - w + 10, pTop + 3.5], [CX + w - 10, pTop + 3.5]);
  const pull = roundRect(CX + 14, pTop - 1, 3, 9, 1.2);
  // Top zip across the main compartment, and the grab handle above.
  const topZip = path([CX - w + 6, top + 24], [Q([CX, top + 14], [CX + w - 6, top + 24])]);
  const handle = loop(14, top - 14, 6, top + 2, 0.7);
  // Shoulder straps: the slivers outside the body on each side.
  const strapR = path([CX + w - 14, top + 10], [
    C([CX + w, top + 12], [CX + w + 6, top + 44], [CX + w + 5, top + 80]),
    C([CX + w + 4, top + 100], [CX + w + 1, top + 116], [CX + w - 6, bottom - 24]),
    L([CX + w - 20, bottom - 24]),
    L([CX + w - 20, top + 30]),
  ], true);
  const strapEdgeR = path([CX + w - 14, top + 10], [C([CX + w, top + 12], [CX + w + 6, top + 44], [CX + w + 5, top + 80]), C([CX + w + 4, top + 100], [CX + w + 1, top + 116], [CX + w - 6, bottom - 24])]);
  return piece({
    base: [fill(strapR, FILL2), fill(mirrored(strapR), FILL2), fill(body)],
    lines: [
      fill(handle, FILL2),
      ink(
        stroke(strapEdgeR),
        stroke(mirrored(strapEdgeR)),
        stroke(handle),
        stroke(body),
        seam(topZip),
        stroke(pocket),
        stroke(zip),
        seam(zipTeeth),
      ),
      fill(pull, FILL2),
      ink(stroke(pull)),
    ],
    clip: body,
    extent: [body, handle, strapR, mirrored(strapR)],
    logo: [CX, pTop + 36, 18],
  });
}

function crossbody(): KitPiece {
  const top = 108;
  const bottom = 186;
  const w = 44;
  const body = symmetric([CX, top], [L([CX + w, top]), L([CX + w, bottom - 8]), Q([CX + w, bottom], [CX + w - 8, bottom]), L([CX, bottom])]);
  const flapBottom = top + 44;
  const flap = symmetric([CX, top], [L([CX + w, top]), L([CX + w, flapBottom - 10]), Q([CX + w, flapBottom], [CX + w - 10, flapBottom]), L([CX, flapBottom])]);
  const strap = loop(w - 4, 14, 5, top, 0.55);
  const slider = roundRect(CX - w - 1, 60, 6, 9, 1.2);
  const clasp = button(CX, flapBottom - 7, 3);
  return piece({
    base: [fill(body)],
    lines: [
      fill(strap, FILL2),
      shade(flap, 0.08),
      ink(stroke(strap), stroke(body), stroke(path([CX - w, flapBottom - 10], [Q([CX - w, flapBottom], [CX - w + 10, flapBottom]), L([CX + w - 10, flapBottom]), Q([CX + w, flapBottom], [CX + w, flapBottom - 10])])), stroke(slider)),
      shade(slider, 0.28),
      clasp,
    ],
    clip: body,
    extent: [body, strap],
    logo: [CX, bottom - 20, 14],
  });
}

function messenger(): KitPiece {
  const top = 78;
  const bottom = 184;
  const wTop = 66;
  const wBot = 72;
  const body = symmetric([CX, top], [L([CX + wTop, top]), L([CX + wBot, bottom - 8]), Q([CX + wBot, bottom], [CX + wBot - 8, bottom]), L([CX, bottom])]);
  const flapBottom = top + 62;
  const xf = wTop + (wBot - wTop) * ((flapBottom - top) / (bottom - top));
  const flapEdge = path([CX - wTop, top], [L([CX - xf, flapBottom - 10]), Q([CX - xf, flapBottom], [CX - xf + 10, flapBottom]), L([CX + xf - 10, flapBottom]), Q([CX + xf, flapBottom], [CX + xf, flapBottom - 10]), L([CX + wTop, top])]);
  const flap = flapEdge + "Z";
  const strap = loop(wTop - 8, 22, 9, top, 0.6);
  // Two buckle straps hanging over the flap edge.
  const tab = (x: number) => path([x - 4, flapBottom - 26], [L([x + 4, flapBottom - 26]), L([x + 4, flapBottom + 14]), Q([x, flapBottom + 18], [x - 4, flapBottom + 14])], true);
  const b1 = buckle(CX - 30, flapBottom - 2, 11, 9, 2.4);
  const b2 = buckle(CX + 30, flapBottom - 2, 11, 9, 2.4);
  return piece({
    base: [fill(body)],
    lines: [
      fill(strap, FILL2),
      shade(flap, 0.08),
      fill(tab(CX - 30)),
      fill(tab(CX + 30)),
      ink(stroke(strap), stroke(body), stroke(flapEdge), stroke(tab(CX - 30)), stroke(tab(CX + 30))),
      b1.fills, b1.lines, b2.fills, b2.lines,
    ],
    clip: body,
    extent: [body, strap],
    logo: [CX, flapBottom + 24, 14],
  });
}

function duffel(): KitPiece {
  const top = 86;
  const bottom = 166;
  const w = 82;
  const r = (bottom - top) / 2;
  const cy = (top + bottom) / 2;
  const body = symmetric([CX, top], [
    L([CX + w - r, top]),
    C([CX + w - r * 0.45, top], [CX + w, cy - r * 0.55], [CX + w, cy]),
    C([CX + w, cy + r * 0.55], [CX + w - r * 0.45, bottom], [CX + w - r, bottom]),
    L([CX, bottom]),
  ]);
  // End caps: the barrel's round ends, seen as a curve inside each end.
  const endSeam = path([CX + w - r - 2, top + 1], [C([CX + w - r + 10, top + 10], [CX + w - r + 10, bottom - 10], [CX + w - r - 2, bottom - 1])]);
  const zip = polyline([CX - w + r + 6, top + 7], [CX + w - r - 6, top + 7]);
  const zipTeeth = polyline([CX - w + r + 6, top + 10], [CX + w - r - 6, top + 10]);
  const pull = roundRect(CX + w - r - 14, top + 6, 8, 3, 1);
  const handleBack = loop(24, 20, 8, top, 0.65);
  const handleFront = loop(32, 28, 8, top, 0.65);
  const strapRing = ring(CX + w - r - 6, cy - 6, 3.5);
  return piece({
    base: [fill(body)],
    lines: [
      fill(handleBack, FILL2),
      shade(handleBack, 0.14),
      fill(handleFront, FILL2),
      ink(stroke(handleBack), stroke(handleFront), stroke(body), seam(endSeam), seam(mirrored(endSeam)), stroke(zip), seam(zipTeeth), stroke(pull)),
      strapRing,
      ring(CX - w + r + 6, cy - 6, 3.5),
    ],
    clip: body,
    extent: [body, handleBack, handleFront],
    logo: [CX, cy + 12, 16],
  });
}

export const BAG: Record<string, KitPiece> = {
  "bag~backpack": backpack(),
  "bag~crossbody": crossbody(),
  "bag~messenger": messenger(),
  "bag~duffel": duffel(),
};
BAG["bag"] = BAG["bag~backpack"];
