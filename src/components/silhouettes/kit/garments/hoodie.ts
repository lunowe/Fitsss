/**
 * Hoodie: pullover with a two-panel hood lying flat behind the shoulders, its
 * opening showing the lining, a drawstring, a kangaroo pocket, rib cuffs and
 * hem. The hood grows with the shoulders so every fit keeps the same head room.
 */
import { button, C, CX, FILL2, fill, framedByType, ink, L, mirrored, path, piece, polyline, seam, shade, stroke, symmetric } from "../draw";
import { hood } from "../parts-outer";
import type { KitPiece } from "../types";
import { crewNeck, torso, type TorsoSpec } from "../torso";

const NECK_Y = 44;
const NECK_W = 16;
const OPENING = 24; // depth of the front opening
const RIB = 10;

const BASE: Omit<TorsoSpec, "neck"> = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 61,
  shoulderDrop: 9,
  chestW: 60,
  hemW: 57,
  length: 180,
  armhole: 34,
  sleeveLen: 118,
  cuffW: 25,
  sleeveAngle: 75,
};

const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 56, chestW: 54, waistW: 50, hemW: 51, length: 174, armhole: 31, sleeveLen: 114, cuffW: 22, sleeveAngle: 77 },
  regular: {},
  relaxed: { shoulderW: 65, chestW: 65, hemW: 62, length: 184, armhole: 37, cuffW: 27 },
  oversized: { shoulderW: 75, shoulderDrop: 13, chestW: 75, hemW: 73, length: 200, armhole: 44, sleeveLen: 124, cuffW: 31, sleeveAngle: 73 },
  boxy: { shoulderW: 73, shoulderDrop: 11, chestW: 72, hemW: 72, length: 164, armhole: 42, sleeveLen: 116, cuffW: 30, sleeveAngle: 74 },
};

function hoodie(fit: string): KitPiece {
  const spec: TorsoSpec = { ...BASE, ...FITS[fit], neck: crewNeck(NECK_W, NECK_Y, OPENING) };
  const t = torso(spec);
  const h = hood(NECK_W, NECK_Y, spec.shoulderW * 0.34, OPENING);
  // Drawstring: two grommets at the bottom of the opening, the cords hanging.
  const grommetY = NECK_Y + OPENING - 3;
  const string = (x: number, k: number) => path([x, grommetY + 2], [C([x + 2 * k, grommetY + 16], [x + 0.5 * k, grommetY + 30], [x + 3 * k, grommetY + 42])]);
  // Kangaroo pocket.
  const pw = spec.chestW - 15;
  const pTop = spec.length - RIB - 44;
  const pBot = spec.length - RIB - 3;
  const pocket = symmetric([CX, pTop], [L([CX + pw - 13, pTop]), L([CX + pw, pTop + 12]), L([CX + pw, pBot]), L([CX, pBot])]);
  const graphicY = t.armpit[1] + (pTop - t.armpit[1]) * 0.5;
  const graphicSize = Math.min(34, Math.round(pTop - (NECK_Y + OPENING) - 10));
  const block = h.back + t.sleevePanel() + mirrored(t.sleevePanel());
  return piece({
    base: [fill(h.back), fill(t.outline)],
    lines: [
      fill(h.lining),
      shade(h.lining, 0.26),
      fill(t.hemBand(RIB), FILL2),
      fill(t.cuffBand(RIB), FILL2),
      fill(mirrored(t.cuffBand(RIB)), FILL2),
      ink(
        stroke(h.back),
        seam(h.seam),
        stroke(t.outline),
        stroke(h.lining),
        t.armSeams,
        t.cuffLines(RIB),
        seam(t.hemLine(RIB)),
        stroke(string(CX - 6, -1)),
        stroke(string(CX + 6, 1)),
        seam(pocket),
        stroke(polyline([CX - pw + 13, pTop], [CX - pw, pTop + 12])),
        stroke(polyline([CX + pw - 13, pTop], [CX + pw, pTop + 12])),
      ),
      button(CX - 6, grommetY, 1.6),
      button(CX + 6, grommetY, 1.6),
    ],
    clip: h.back + t.outline,
    extent: [h.back, t.outline],
    graphic: [CX, graphicY, graphicSize],
    logo: [CX + spec.chestW * 0.5, t.armpit[1] + 2, Math.round(spec.chestW * 2 * 0.17)],
    block,
  });
}

const fits: Record<string, KitPiece> = Object.fromEntries(Object.keys(FITS).map((fit) => [`hoodie@${fit}`, hoodie(fit)]));
fits["hoodie"] = fits["hoodie@regular"];

/** All fits share one frame, so an oversized hoodie draws bigger than a fitted one. */
export const HOODIE: Record<string, KitPiece> = framedByType(fits);
