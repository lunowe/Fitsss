import type { ArtLayers, Box } from "./types";
import { PATTERN_TILES, type PatternTile } from "./patterns";

/**
 * Lays a pattern into a layered drawing and returns the SVG body to draw.
 *
 * The recipe is deliberately plain string assembly, because the iOS app does
 * the same thing in Swift from the catalog payload (`layers` per drawing plus
 * the `PATTERN_TILES` table); keep the two in step:
 *
 *   base
 *   <clipPath id=…><path d=clip/></clipPath>
 *   <g clip-path=url(#…)> overlay </g>
 *   lines
 *
 * overlay by tile kind:
 *   field  the tile's 100×100 markup scaled uniformly to cover `box`
 *          (side = max(w, h), centered); `markupV` when the garment's
 *          stripes run vertically and the tile has one.
 *   motif  the tile's 100×100 markup scaled to `graphic` (or `logo`) size,
 *          centered on that anchor. Without the anchor, nothing is drawn.
 *   block  a path of `layers.block` filled with the pattern color; without a
 *          block panel, the tile's field markup (if any) instead.
 *
 * Field tiles then repeat on every `layers.panels` entry i, inside the same
 * clipped group, after the main overlay:
 *   <clipPath id=…-i><path d=panel.clip/></clipPath>
 *   <g clip-path=url(#…-i)>
 *     <path d=panel.clip fill=var(--icon-fill)/>
 *     <g transform="rotate(angle cx cy) translate(cx-side/2 cy-side/2) scale(side/100)"> markup </g>
 *   </g>
 * with (cx, cy) the center of panel.box and side the main box's max(w, h), so
 * the density matches the body.
 *
 * `id` must be unique in the document: inline SVGs share one id space on the web.
 */
export function composeLayers(layers: ArtLayers, pattern: string, id: string): string | undefined {
  const tile = PATTERN_TILES[pattern];
  if (!tile) return undefined;
  const overlay = overlayFor(layers, tile);
  if (!overlay) return undefined;
  return (
    layers.base +
    `<clipPath id="${id}"><path d="${layers.clip}"/></clipPath>` +
    `<g clip-path="url(#${id})">${overlay}${tile.kind === "field" ? panelsFor(layers, tile, id) : ""}</g>` +
    layers.lines
  );
}

function fieldMarkup(layers: ArtLayers, tile: PatternTile): string {
  return layers.stripe === "v" && tile.markupV ? tile.markupV : tile.markup;
}

function panelsFor(layers: ArtLayers, tile: PatternTile, id: string): string {
  const side = Math.max(layers.box[2], layers.box[3]);
  return (layers.panels ?? [])
    .map((panel, i) => {
      const [x, y, w, h] = panel.box;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const transform =
        `rotate(${num(panel.angle)} ${num(cx)} ${num(cy)}) ` +
        `translate(${num(cx - side / 2)} ${num(cy - side / 2)}) scale(${num(side / 100)})`;
      return (
        `<clipPath id="${id}-${i}"><path d="${panel.clip}"/></clipPath>` +
        `<g clip-path="url(#${id}-${i})"><path d="${panel.clip}" fill="var(--icon-fill)"/>` +
        `<g transform="${transform}">${fieldMarkup(layers, tile)}</g></g>`
      );
    })
    .join("");
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

/** Uniform scale of a 100×100 tile so it covers `box`, centered. */
export function coverTransform([x, y, w, h]: Box): string {
  const side = Math.max(w, h);
  const s = side / 100;
  return `translate(${num(x + w / 2 - side / 2)} ${num(y + h / 2 - side / 2)}) scale(${num(s)})`;
}

/** A 100×100 tile scaled to `size` and centered on (cx, cy). */
export function anchorTransform([cx, cy, size]: readonly [number, number, number]): string {
  const s = size / 100;
  return `translate(${num(cx - size / 2)} ${num(cy - size / 2)}) scale(${num(s)})`;
}

function overlayFor(layers: ArtLayers, tile: PatternTile): string | undefined {
  switch (tile.kind) {
    case "field":
      return `<g transform="${coverTransform(layers.box)}">${fieldMarkup(layers, tile)}</g>`;
    case "motif": {
      const anchor = tile.anchor === "logo" ? layers.logo : layers.graphic;
      return anchor ? `<g transform="${anchorTransform(anchor)}">${tile.markup}</g>` : undefined;
    }
    case "block":
      if (layers.block) return `<path d="${layers.block}" fill="var(--icon-pattern, #000)"/>`;
      return tile.markup ? `<g transform="${coverTransform(layers.box)}">${tile.markup}</g>` : undefined;
  }
}
