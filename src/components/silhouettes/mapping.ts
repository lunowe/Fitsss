/**
 * Which drawing a catalog piece type renders with.
 *
 * Keys are `PieceType.id` from `src/domain/catalog`; `art` and the values of
 * `variants` are art ids from `./art`. `variants` keys are ids out of the
 * type's `variantOptions`, so footwear and bags can show the actual shape the
 * user picked instead of a generic one.
 *
 * A type with no entry here falls back to the drawn glyph in `./glyphs`.
 */
export interface ArtMapping {
  art: string;
  variants?: Record<string, string>;
}

export const ART_FOR_TYPE: Record<string, ArtMapping> = {
  // tops
  "t-shirt": { art: "tee" },
  "long-sleeve-tee": { art: "long-sleeve-tee" },
  "tank-top": { art: "tank" },
  polo: { art: "polo" },
  henley: { art: "henley" },
  shirt: { art: "shirt" },
  "dress-shirt": { art: "dress-shirt" },

  // layers
  "crewneck-sweater": { art: "sweater" },
  hoodie: { art: "hoodie" },
  sweatshirt: { art: "sweatshirt" },
  cardigan: { art: "cardigan" },
  turtleneck: { art: "turtleneck" },
  "quarter-zip": { art: "quarter-zip" },
  overshirt: { art: "overshirt" },
  fleece: { art: "fleece" },
  vest: { art: "vest" },

  // outerwear
  "denim-jacket": { art: "denim-jacket" },
  bomber: { art: "bomber" },
  "leather-jacket": { art: "leather-jacket" },
  blazer: { art: "blazer" },
  harrington: { art: "harrington" },
  "chore-jacket": { art: "chore-jacket" },
  "trench-coat": { art: "long-coat" },
  "wool-coat": { art: "peacoat" },
  puffer: { art: "puffer" },
  parka: { art: "parka" },
  "rain-jacket": { art: "rain-jacket" },

  // bottoms
  jeans: { art: "jeans" },
  chinos: { art: "chinos" },
  trousers: { art: "trousers" },
  "cargo-pants": { art: "cargo-pants" },
  sweatpants: { art: "sweatpants" },
  shorts: { art: "shorts" },
  "denim-shorts": { art: "denim-shorts" },
  // skirt: no art in the source set, keeps the drawn glyph.

  // footwear
  sneakers: {
    art: "sneaker",
    variants: {
      "high-top": "sneaker-high-top",
      chunky: "sneaker-chunky",
      running: "sneaker-running",
      retro: "sneaker-retro",
      "slip-on": "sneaker-slip-on",
    },
  },
  boots: { art: "boot", variants: { chelsea: "boot-chelsea" } },
  loafers: { art: "loafer" },
  "dress-shoes": { art: "dress-shoe" },
  // sandals: no art.

  // accessories
  cap: { art: "cap" },
  beanie: { art: "beanie" },
  scarf: { art: "scarf" },
  bag: {
    art: "backpack",
    variants: {
      crossbody: "crossbody-bag",
      messenger: "messenger-bag",
      duffel: "duffel-bag",
    },
  },
  tote: { art: "tote" },
  // belt, sunglasses, watch: no art.

  // fullbody: dress and jumpsuit have no art.
};

/** The art id for a piece type, honouring its variant. Undefined means glyph. */
export function artForType(typeId: string, variant?: string): string | undefined {
  const entry = ART_FOR_TYPE[typeId];
  if (!entry) return undefined;
  return (variant ? entry.variants?.[variant] : undefined) ?? entry.art;
}
