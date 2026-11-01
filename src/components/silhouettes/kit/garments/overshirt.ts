/**
 * Overshirt: a heavy shirt worn as a layer. Boxy body with a straight hem,
 * point collar, two buttoned chest pockets with flaps, buttoned cuffs.
 */
import { button, CX, fill, ink, L, mirrored, path, piece, seam, stroke } from "../draw";
import { placket, pocketFlap, topFit, vNeckUnder } from "../parts-tops";
import { fitTable } from "../parts-outer";
import type { KitPiece } from "../types";
import { torso, type TorsoSpec } from "../torso";
import { pointCollar } from "./shirt";

const NECK_Y = 22;
const NECK_W = 15;

const BASE: Omit<TorsoSpec, "neck"> = {
  neckW: NECK_W,
  neckY: NECK_Y,
  shoulderW: 62,
  shoulderDrop: 9,
  chestW: 60,
  hemW: 60,
  length: 160,
  armhole: 34,
  sleeveLen: 112,
  cuffW: 24,
  sleeveW: 27,
  hang: 2.5,
  sleeveAngle: 75,
};

const FITS = ["regular", "relaxed", "oversized", "boxy"];

function overshirt(fit: string): KitPiece {
  const spec: TorsoSpec = { ...topFit(BASE, fit), neck: vNeckUnder(NECK_W, NECK_Y) };
  const t = torso(spec);
  const collar = pointCollar(NECK_W, NECK_Y);
  const p = placket(NECK_Y + 14, spec.length - 1, 3.5, 0, false);
  const buttons: string[] = [];
  for (let y = NECK_Y + 13 + 12; y < spec.length - 14; y += 24) buttons.push(button(CX, y, 1.8));
  // Chest pockets with pointed flaps, one each side of the placket.
  const pw = 20;
  const ph = 17;
  const px = CX + spec.chestW * 0.28;
  const py = t.bodyY(0.04) + 4;
  const pocket = path([px, py], [L([px + pw, py]), L([px + pw, py + ph]), L([px, py + ph])], true);
  const flap = pocketFlap(px, py, pw, 7);
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
      ink(
        stroke(t.edges),
        t.armSeams,
        t.cuffLines(cuffDepth),
        seam(t.hemLine(4)),
        p.lines,
        seam(pocket),
        seam(mirrored(pocket)),
        stroke(flap),
        stroke(mirrored(flap)),
      ),
      ...buttons,
      button(px + pw / 2, py + 3.5, 1.5),
      button(2 * CX - px - pw / 2, py + 3.5, 1.5),
      button(cuffMid[0], cuffMid[1], 1.6),
      button(2 * CX - cuffMid[0], cuffMid[1], 1.6),
      collar.lines,
    ],
    clip: t.outline,
    panels: t.panels,
    stripe: "v",
  });
}

export const OVERSHIRT: Record<string, KitPiece> = fitTable("overshirt", FITS, "regular", overshirt);
