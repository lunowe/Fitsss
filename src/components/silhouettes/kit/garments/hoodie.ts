/**
 * Hoodie: pullover with a two-panel hood lying flat behind the shoulders, its
 * opening showing the lining, a drawstring, a kangaroo pocket, rib cuffs and
 * hem. The hood grows with the shoulders so every fit keeps the same head room.
 */
import { button, C, CX, FILL2, fill, framedByType, ink, L, mirrored, path, piece, polyline, seam, shade, stroke, symmetric } from "../draw";
import { hood, sleeveHang, sleevePanelsOf, withPanels } from "../parts-outer";
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
  sleeveAngle: 76,
};

/**
 * Fits share one frame, so each step has to read at 92 px: fitted pulls in a
 * waist, relaxed is a full size up, oversized drops the shoulders and runs
 * long, boxy is as wide as oversized but stops at the hip.
 */
const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 56, chestW: 54, waistW: 50, hemW: 50, length: 174, armhole: 31, sleeveLen: 114, cuffW: 22 },
  regular: {},
  relaxed: { shoulderW: 67, chestW: 67, hemW: 64, length: 188, armhole: 38, sleeveLen: 123, cuffW: 28 },
  oversized: { shoulderW: 76, shoulderDrop: 13, chestW: 76, hemW: 74, length: 204, armhole: 45, sleeveLen: 128, cuffW: 32 },
  boxy: { shoulderW: 74, shoulderDrop: 11, chestW: 73, hemW: 73, length: 172, armhole: 43, sleeveLen: 118, cuffW: 30 },
};

function hoodie(fit: string): KitPiece {
  const dims = { ...BASE, ...FITS[fit] };
  // The sleeves hang along the body: no wedge of background beside the torso.
  const bodyX = (y: number) => {
    const armpitY = NECK_Y + dims.shoulderDrop + dims.armhole;
    const t = Math.min(1, Math.max(0, (y - armpitY) / (dims.length - armpitY)));
    return CX + dims.chestW + (dims.hemW - dims.chestW) * t;
  };
  dims.sleeveAngle = sleeveHang([CX + dims.shoulderW, NECK_Y + dims.shoulderDrop], dims.sleeveLen, dims.cuffW, bodyX, 2.5, dims.sleeveAngle);
  const spec: TorsoSpec = { ...dims, neck: crewNeck(NECK_W, NECK_Y, OPENING) };
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
  // Print anchors: the graphic sits in the band between the drawstring ends
  // and the pocket, the logo on the left chest, about a quarter of the chest.
  const bandTop = grommetY + 8;
  const bandBottom = pTop - 5;
  const graphicSize = Math.min(Math.round(spec.chestW), Math.round((bandBottom - bandTop) * 0.8));
  const graphicY = Math.round(((bandTop + bandBottom) / 2) * 10) / 10;
  const logoSize = Math.round(spec.chestW * 2 * 0.23);
  const block = h.back + t.sleevePanel() + mirrored(t.sleevePanel());
  return withPanels(
    piece({
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
      logo: [Math.round(CX + spec.chestW * 0.5), t.armpit[1] + 6, logoSize],
      block,
    }),
    sleevePanelsOf(t.sleevePanel(), spec.sleeveAngle),
  );
}

const fits: Record<string, KitPiece> = Object.fromEntries(Object.keys(FITS).map((fit) => [`hoodie@${fit}`, hoodie(fit)]));
fits["hoodie"] = fits["hoodie@regular"];

/** All fits share one frame, so an oversized hoodie draws bigger than a fitted one. */
export const HOODIE: Record<string, KitPiece> = framedByType(fits);
