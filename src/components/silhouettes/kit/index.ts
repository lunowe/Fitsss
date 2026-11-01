import type { KitPiece } from "./types";
import { HOODIE } from "./garments/hoodie";
import { JEANS } from "./garments/jeans";
import { SHIRT } from "./garments/shirt";
import { SKIRT } from "./garments/skirt";
import { SNEAKERS } from "./garments/sneakers";
import { TEE } from "./garments/tee";
import { TOTE } from "./garments/tote";
import { GROUP as FEET } from "./groups/feet";
import { GROUP as OUTER } from "./groups/outer";
import { GROUP as TOPS } from "./groups/tops";

export type { ArtLayers, Box, KitPiece } from "./types";
export { PATTERN_TILES, type PatternTile } from "./patterns";
export { anchorTransform, composeLayers, coverTransform } from "./compose";

/**
 * Every kit drawing by key. Keys are `typeId`, `typeId~variant` or
 * `typeId@fit`; fits or variants that draw the same share one key.
 */
export const KIT: Record<string, KitPiece> = {
  ...TEE,
  ...SHIRT,
  ...HOODIE,
  ...JEANS,
  ...SKIRT,
  ...SNEAKERS,
  ...TOTE,
  ...TOPS,
  ...OUTER,
  ...FEET,
};

/** The kit drawing for a piece, honouring variant and fit. Undefined: not in the kit. */
export function kitKey(typeId: string, variant?: string, fit?: string): string | undefined {
  for (const key of [
    variant ? `${typeId}~${variant}` : undefined,
    fit ? `${typeId}@${fit}` : undefined,
    typeId,
  ]) {
    if (key && KIT[key]) return key;
  }
  return undefined;
}
