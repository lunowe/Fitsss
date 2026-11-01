/**
 * Cardigan: an open-front knit buttoned up the center: a V neck framed by the
 * button band, five buttons, two patch pockets at the hips, rib cuffs and hem.
 */
import { button, CX, fill, ink, L, mirrored, path, piece, polyline, seam, stroke, type Pt } from "../draw";
import { chestAnchors, patchPocket, ribTrims, topFit } from "../parts-tops";
import { fitTable } from "../parts-outer";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";

const NECK_Y = 20;
const NECK_W = 14;
const V_DEPTH = 44;
const BAND = 6;
const RIB = 7;

const BASE: Omit<TorsoSpec, "neck"> = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 58,
  shoulderDrop: 9,
  chestW: 56,
  hemW: 54,
  length: 156,
  armhole: 32,
  sleeveLen: 112,
  cuffW: 22,
  sleeveW: 25,
  hang: 2.5,
  sleeveAngle: 75,
};

const FITS = ["fitted", "regular", "relaxed", "oversized", "boxy"];

function cardigan(fit: string): KitPiece {
  const vY = NECK_Y + V_DEPTH;
  const spec: TorsoSpec = { ...topFit(BASE, fit), neck: { start: [CX, vY], segs: [L([CX + NECK_W, NECK_Y])] } };
  const t = torso(spec);
  const trims = ribTrims(t, RIB, RIB);
  const hemTop = spec.length - RIB;
  // Button band: a strip inside the V edge, continuing down the center front.
  // Its inner edge is the V edge offset by BAND, then the line x = CX + BAND.
  const e: Pt = [-NECK_W, V_DEPTH];
  const len = Math.hypot(e[0], e[1]);
  const n: Pt = [e[1] / len, -e[0] / len]; // inward normal (right and down)
  const p0: Pt = [CX + NECK_W + n[0] * BAND, NECK_Y + n[1] * BAND];
  // back up along the edge direction to the shoulder line
  const startX = p0[0] + (p0[1] - NECK_Y) * (NECK_W / V_DEPTH);
  // down the edge direction to x = CX + BAND
  const s = ((p0[0] - CX - BAND) * len) / NECK_W;
  const cornerY = p0[1] + (s * V_DEPTH) / len;
  const bandInner = polyline([startX, NECK_Y + 0.5], [CX + BAND, cornerY], [CX + BAND, hemTop]);
  const centerLine = polyline([CX, vY], [CX, spec.length]);
  const buttons: string[] = [];
  const first = vY + 10;
  const last = hemTop - 8;
  for (let i = 0; i < 5; i++) buttons.push(button(CX, first + ((last - first) * i) / 4, 1.9));
  // Patch pockets just above the hem rib.
  const pw = 19;
  const ph = 16;
  const px = CX + spec.chestW * 0.3;
  const py = hemTop - ph - 7;
  const pocket = patchPocket(px, py, pw, ph);
  return piece({
    base: [fill(t.outline)],
    lines: [
      t.sleeveShade,
      trims.fills,
      ink(
        stroke(t.edges),
        t.armSeams,
        trims.lines,
        seam(bandInner),
        seam(mirrored(bandInner)),
        stroke(centerLine),
        seam(pocket),
        seam(mirrored(pocket)),
        stroke(path([px, py], [L([px + pw, py])])),
        stroke(path([2 * CX - px, py], [L([2 * CX - px - pw, py])])),
      ),
      ...buttons,
    ],
    clip: t.outline,
    panels: t.panels,
    stripe: "h",
    logo: chestAnchors(t, { logoX: 0.5, logoY: vY + 16 }).logo,
    block: t.sleevePanel() + mirrored(t.sleevePanel()),
  });
}

export const CARDIGAN: Record<string, KitPiece> = fitTable("cardigan", FITS, "regular", cardigan);
