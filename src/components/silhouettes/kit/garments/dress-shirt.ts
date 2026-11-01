/**
 * Dress shirt: the formal button-up. A spread collar, a clean front with no
 * pocket, barrel cuffs with one button, a shirt-tail hem; cut closer than
 * the casual shirt.
 */
import { button, CX, fill, ink, piece, seam, stroke } from "../draw";
import { foldCollar, placket, topFit, vNeckUnder } from "../parts-tops";
import { fitTable } from "../parts-outer";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";

const NECK_Y = 22;
const NECK_W = 15;

const BASE: Omit<TorsoSpec, "neck"> = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 56,
  shoulderDrop: 9,
  chestW: 52,
  waistW: 48,
  hemW: 50,
  length: 170,
  hemCurve: 7,
  armhole: 31,
  sleeveLen: 114,
  cuffW: 21,
  sleeveW: 24,
  hang: 2.5,
  sleeveAngle: 76,
};

const FITS = ["fitted", "regular", "relaxed"];

function dressShirt(fit: string): KitPiece {
  const spec: TorsoSpec = { ...topFit(BASE, fit), neck: vNeckUnder(NECK_W, NECK_Y) };
  const t = torso(spec);
  // Spread collar: wide-set, shorter points.
  const collar = foldCollar(NECK_W, NECK_Y, {
    back: NECK_W + 6,
    meet: [CX + 1.5, NECK_Y + 13],
    point: [CX + 17, NECK_Y + 25],
    bow: [CX + NECK_W + 9, NECK_Y + 13],
    throat: NECK_Y + 12,
  });
  const hemY = spec.length + (spec.hemCurve ?? 0);
  const buttonsTop = NECK_Y + 13 + 12;
  const count = Math.floor((hemY - 14 - buttonsTop) / 22) + 1;
  const p = placket(NECK_Y + 14, hemY - 1, 3.5, 0, false);
  const buttons: string[] = [];
  for (let i = 0; i < count; i++) buttons.push(button(CX, buttonsTop + i * 22, 1.8));
  const cuffDepth = 12;
  const cuffMid = [
    (t.cuffOuter[0] + t.cuffInner[0]) / 2 - t.sleeveDir[0] * (cuffDepth / 2),
    (t.cuffOuter[1] + t.cuffInner[1]) / 2 - t.sleeveDir[1] * (cuffDepth / 2),
  ] as const;
  return piece({
    base: [fill(t.outline)],
    lines: [
      t.sleeveShade,
      collar.fills,
      ink(stroke(t.edges), t.armSeams, t.cuffLines(cuffDepth), seam(t.hemLine(4)), p.lines),
      ...buttons,
      button(cuffMid[0], cuffMid[1], 1.6),
      button(2 * CX - cuffMid[0], cuffMid[1], 1.6),
      ink(collar.lines),
    ],
    clip: t.outline,
    panels: t.panels,
    stripe: "v",
  });
}

export const DRESS_SHIRT: Record<string, KitPiece> = fitTable("dress-shirt", FITS, "regular", dressShirt);
