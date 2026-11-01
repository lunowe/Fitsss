# The garment kit

Fitsss's own garment drawings, built from code so every piece shares one visual language
and can be drawn per fit and per pattern. `Silhouette` (`../index.tsx`) resolves a kit
drawing first (`KIT[kitKey(typeId, variant, fit)]`), lays the piece's pattern between
`layers.base` and `layers.lines` (`compose.ts`) and falls back to the imported art for
anything the kit does not cover yet.

## The visual language

- **Flat lays, front view.** Garments lie flat as if photographed from above, symmetric
  about the center line, sleeves slightly out from the body. Shoes are a side view, toe to the
  right. Bags are a front view with their handles up.
- **One line.** Every stroke is `--icon-stroke` at 1 screen px (`vector-effect:
  non-scaling-stroke`). Outlines and edges at full ink; interior seams, stitching and
  pocket lines at `SEAM` (50%) opacity. Nothing heavier, nothing thinner.
- **Calm detail.** Only what identifies the piece: a tee has a rib, a hem and two sleeve
  stitches; jeans have a fly, pockets and loops. Details are 3–4 units apart at minimum so
  they still separate at 56 px, and nothing is finer than ~1.5 units.
- **Paint is four variables.** `--icon-fill` for fabric, `--icon-fill-2` for trims that are a
  second material (ribbing, collar stands, soles, straps, hood linings), `--icon-stroke` for
  ink, `--icon-pattern` for patterns. Depth comes from `shade()`, the ink at 10–30% opacity:
  it darkens light pieces and lifts dark ones, so one drawing works in white, black and every
  mid color.
- **Square framing.** `piece()` frames every drawing in a square viewBox around its bounds
  plus 5% padding, so every piece fills a square tile the same way. Tops fill the width,
  bottoms the height, shoes sit centered.
- **Proportions.** Design space is 200 units wide, centered on x = 100. A regular tee is
  ~116 wide and ~120 tall (shoulder to hem); a shirt ~150 tall; trousers ~225 tall; a shoe
  ~170 long and ~70 tall. Keep new pieces on this scale so the family reads together.
- **Fits are numbers.** Each garment module has a base spec and a per-fit override table;
  fits change widths, lengths, shoulder drop and sleeve size, never the detailing.

## Layers and patterns

A kit piece is `{ viewBox, body, layers }` (`types.ts`). `body` is the plain drawing and
always equals `layers.base + layers.lines`.

- `base`: fabric fills only. A pattern is laid over these, clipped to `layers.clip`.
- `lines`: everything that must stay above a pattern: trims in `FILL2`, shading, ink.
- `clip`: the fabric silhouette, usually the same path as the main outline (trims cover it
  from `lines`, so they do not need to be cut out).
- `stripe`: `"h"` for knits and tees, `"v"` for wovens (shirts, trousers, skirts).
- `graphic` / `logo`: `[cx, cy, size]` anchors on the chest (or the face of a bag).
- `block`: the colorblock panel (sleeves, hood, toe cap and heel…), as path data.

Pattern tiles live in `patterns.ts`; they are 100×100 and painted with `--icon-pattern`.
Field tiles are scaled to the longer side of `layers.box`, so density is relative to the
garment.

## Building a new garment (phase 2)

Everything you need is in `draw.ts`, `torso.ts` (tops) and `legs.ts` (bottoms). A sweater is
a tee with long sleeves and rib trims:

```ts
import { CX, FILL2, fill, ink, mirrored, piece, seam, stroke } from "../draw";
import { crewRib } from "./tee";
import { torso, type TorsoSpec } from "../torso";

const BASE: TorsoSpec = {
  neckW: 15, neckY: 20, shoulderW: 58, shoulderDrop: 9, chestW: 56, hemW: 52,
  length: 150, armhole: 32, sleeveLen: 112, cuffW: 22, sleeveAngle: 75,
};
const FITS: Record<string, Partial<TorsoSpec>> = {
  fitted: { shoulderW: 54, chestW: 51, waistW: 46, hemW: 47 },
  regular: {},
  relaxed: { shoulderW: 62, chestW: 61, hemW: 57 },
  oversized: { shoulderW: 72, shoulderDrop: 13, chestW: 71, hemW: 68, length: 166, armhole: 42, cuffW: 27 },
  boxy: { shoulderW: 70, shoulderDrop: 11, chestW: 69, hemW: 69, length: 136, armhole: 40 },
};

function sweater(fit: string) {
  const spec = { ...BASE, ...FITS[fit] };
  const t = torso(spec);                     // outline, armpit, cuffs, seams…
  const rib = crewRib(spec.neckW, spec.neckY, 15, 4);
  return piece({
    base: [fill(t.outline)],
    lines: [
      rib.fills,
      fill(t.hemBand(9), FILL2), fill(t.cuffBand(9), FILL2), fill(mirrored(t.cuffBand(9)), FILL2),
      ink(stroke(t.outline), t.armSeams, t.cuffLines(9), seam(t.hemLine(9))),
      rib.lines,
    ],
    clip: t.outline,
    stripe: "h",
    graphic: [CX, t.bodyY(0.3), 40],
    logo: [CX + spec.chestW * 0.42, t.bodyY(0.12), 13],
    block: t.sleevePanel() + mirrored(t.sleevePanel()),
  });
}

export const SWEATER = Object.fromEntries(Object.keys(FITS).map((f) => [`crewneck-sweater@${f}`, sweater(f)]));
SWEATER["crewneck-sweater"] = SWEATER["crewneck-sweater@regular"];
```

Then spread the record into `KIT` in `index.ts`. Rules of thumb:

- Build closed shapes with `symmetric(start, rightHalfSegments)` and open seams with
  `path` / `polyline`; mirror a right-side detail with `mirrored(d)`.
- Put trims and hardware in `lines` (they must cover the pattern), fabric in `base`.
- Reuse `crewRib`, `pointCollar` (shirt), `sole` (sneakers), `frontPocket` (legs) before
  drawing a new one; add a new shared helper when two garments would share it.
- Fits that would look identical may share a key: just point both keys at one piece.
- Check the result on a board at 56, 96 and 240 px in white, black, navy, olive and rust,
  with every pattern the type offers, before calling it done. `kit.test.ts` checks the
  markup contract (elements, attributes, paint variables, `body === base + lines`).
