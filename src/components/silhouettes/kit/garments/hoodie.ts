/**
 * Hoodie: pullover with a two-panel hood lying flat behind the shoulders, its
 * opening showing the lining, a drawstring, a kangaroo pocket, rib cuffs and
 * hem. Fits come from the shared top table, so a fitted hoodie pulls in a
 * waist and an oversized one drops its shoulders like every other top; the
 * hood grows with the shoulders so every fit keeps the same head room.
 */
import { button, C, CX, FILL2, fill, framedByType, ink, L, mirrored, path, piece, polyline, seam, shade, stroke, symmetric } from "../draw";
import { fitTable, hood } from "../parts-outer";
import { topFit } from "../parts-tops";
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
  sleeveW: 27,
  hang: 2.5,
  sleeveAngle: 76,
};

const FITS = ["fitted", "regular", "relaxed", "oversized", "boxy"];

function hoodie(fit: string): KitPiece {
  const spec: TorsoSpec = { ...topFit(BASE, fit), neck: crewNeck(NECK_W, NECK_Y, OPENING) };
  const t = torso(spec);
  const h = hood(NECK_W, NECK_Y, spec.shoulderW * 0.34, OPENING);
  // Drawstring: two grommets at the bottom of the opening, the cords hanging.
  const grommetY = NECK_Y + OPENING - 3;
  const string = (x: number, k: number) => path([x, grommetY + 2], [C([x + 2 * k, grommetY + 16], [x + 0.5 * k, grommetY + 30], [x + 3 * k, grommetY + 42])]);
  // Kangaroo pocket: all of it at seam weight, so it sits in the cloth
  // instead of weighing on a dark piece.
  // A cropped body keeps a real pocket: it starts below the drawstring ends
  // rather than at a fraction of a short body.
  const pw = spec.chestW - 15;
  const pBot = spec.length - RIB - 3;
  const pTop = Math.max(spec.length - RIB - 44, t.armpit[1] + 16);
  const pocket = symmetric([CX, pTop], [L([CX + pw - 13, pTop]), L([CX + pw, pTop + 12]), L([CX + pw, pBot]), L([CX, pBot])]);
  // Print anchors: the graphic sits in the band between the drawstring ends
  // and the pocket, the logo on the left chest, about a fifth of the chest.
  const bandTop = grommetY + 8;
  const bandBottom = pTop - 5;
  const graphicSize = Math.min(Math.round(spec.chestW), Math.round((bandBottom - bandTop) * 0.8));
  const graphicY = Math.round(((bandTop + bandBottom) / 2) * 10) / 10;
  const logoSize = Math.round(spec.chestW * 2 * 0.17);
  const block = h.back + t.sleevePanel() + mirrored(t.sleevePanel());
  return piece({
    base: [fill(h.back), fill(t.outline)],
    lines: [
      t.sleeveShade,
      // The lining is the hood's own cloth seen from inside: a light tone,
      // not a block, so it stays quiet on black and navy.
      fill(h.lining),
      shade(h.lining, 0.14),
      fill(t.hemBand(RIB), FILL2),
      fill(t.cuffBand(RIB), FILL2),
      fill(mirrored(t.cuffBand(RIB)), FILL2),
      ink(
        stroke(h.back),
        seam(h.seam),
        stroke(t.edges),
        stroke(h.lining),
        t.armSeams,
        t.cuffLines(RIB),
        seam(t.hemLine(RIB)),
        stroke(string(CX - 6, -1)),
        stroke(string(CX + 6, 1)),
        seam(pocket),
        seam(polyline([CX - pw + 13, pTop], [CX - pw, pTop + 12])),
        seam(polyline([CX + pw - 13, pTop], [CX + pw, pTop + 12])),
      ),
      button(CX - 6, grommetY, 1.6),
      button(CX + 6, grommetY, 1.6),
    ],
    clip: h.back + t.outline,
    extent: [h.back, t.outline],
    panels: t.panels,
    graphic: [CX, graphicY, graphicSize],
    logo: [Math.round(CX + spec.chestW * 0.38), t.armpit[1] + 9, logoSize],
    block,
  });
}

/** All fits share one frame, so an oversized hoodie draws bigger than a fitted one. */
export const HOODIE: Record<string, KitPiece> = framedByType(fitTable("hoodie", FITS, "regular", hoodie));
