/**
 * Fitsss domain model.
 *
 * A closet is made of abstract *blocks*, not photos. A block is a piece type
 * (from the catalog) plus a small set of typed attributes: color, fit or
 * variant, material, pattern, weight. From those we derive warmth, formality
 * and seasons, which are used as hard filters before any LLM sees the closet.
 *
 * Everything in src/domain is pure TypeScript with no framework imports so it
 * can be unit tested and shared between server and client.
 */

export const CATEGORIES = [
  "top",
  "layer",
  "outerwear",
  "bottom",
  "footwear",
  "accessory",
  "fullbody",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  top: "Tops",
  layer: "Layers",
  outerwear: "Outerwear",
  bottom: "Bottoms",
  footwear: "Shoes",
  accessory: "Accessories",
  fullbody: "Full body",
};

/** Short blurb shown under the category name in the add flow. */
export const CATEGORY_HINTS: Record<Category, string> = {
  top: "Tees, shirts, polos",
  layer: "Sweaters, hoodies, overshirts",
  outerwear: "Jackets and coats",
  bottom: "Jeans, trousers, shorts",
  footwear: "Sneakers, boots, loafers",
  accessory: "Caps, belts, bags",
  fullbody: "Dresses and jumpsuits",
};

export const PATTERNS = [
  "solid",
  "stripe",
  "check",
  "graphic",
  "logo",
  "print",
  "textured",
  "colorblock",
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const PATTERN_LABELS: Record<Pattern, string> = {
  solid: "Solid",
  stripe: "Striped",
  check: "Check / plaid",
  graphic: "Graphic",
  logo: "Logo",
  print: "Print",
  textured: "Textured",
  colorblock: "Colorblock",
};

export const WEIGHTS = ["light", "mid", "heavy"] as const;
export type Weight = (typeof WEIGHTS)[number];

export const WEIGHT_LABELS: Record<Weight, string> = {
  light: "Light",
  mid: "Mid",
  heavy: "Heavy",
};

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export const COLOR_FAMILIES = [
  "neutral",
  "brown",
  "blue",
  "green",
  "red",
  "yellow",
  "pink",
  "purple",
] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number];

/** A color as stored on a block. Custom colors carry their own hex. */
export interface BlockColor {
  /** Human name, e.g. "Navy" or a user-typed "Dusty rose". */
  name: string;
  /** #rrggbb, lowercase. */
  hex: string;
  family: ColorFamily;
  /** Slug of the palette entry when picked from the palette, else undefined. */
  paletteId?: string;
}

export type MaterialId =
  | "cotton"
  | "linen"
  | "wool"
  | "cashmere"
  | "denim"
  | "leather"
  | "suede"
  | "nylon"
  | "polyester"
  | "fleece"
  | "corduroy"
  | "silk"
  | "knit"
  | "canvas"
  | "tech"
  | "jersey"
  | "twill"
  | "mesh"
  | "rubber"
  | "metal";

/**
 * A piece type in the catalog, e.g. "t-shirt" or "chelsea boots".
 * Types are the unit the user drills into when adding pieces.
 */
export interface PieceType {
  id: string;
  category: Category;
  label: string;
  /** Plural label for counts, e.g. "T-shirts". */
  plural: string;
  /** Silhouette glyph id, see src/components/silhouettes. */
  icon: SilhouetteId;
  /**
   * Fit options for garments (tops, layers, outerwear, bottoms, fullbody).
   * Undefined for footwear and accessories, which use `variantOptions`.
   */
  fitOptions?: readonly string[];
  /** Style variants for footwear and accessories, e.g. "low-top", "chelsea". */
  variantOptions?: readonly string[];
  /** Materials that make sense for this type, in display order. First is the default. */
  materialOptions: readonly MaterialId[];
  /** Default weight; the user can override per block. */
  defaultWeight: Weight;
  /** Base warmth 1 (none) to 5 (deep winter). Adjusted by material and weight. */
  baseWarmth: number;
  /** Base formality 1 (gym) to 5 (black tie). Adjusted by material, pattern, fit. */
  baseFormality: number;
  /** Colors suggested first in the picker (palette ids). */
  suggestedColors: readonly string[];
  /** Patterns that make sense for this type. `solid` is always allowed. */
  patternOptions: readonly Pattern[];
}

export const SILHOUETTE_IDS = [
  "tee",
  "longsleeve",
  "tank",
  "polo",
  "shirt",
  "henley",
  "sweater",
  "hoodie",
  "cardigan",
  "turtleneck",
  "quarterzip",
  "overshirt",
  "vest",
  "jacket",
  "blazer",
  "coat",
  "puffer",
  "parka",
  "trench",
  "jeans",
  "trousers",
  "shorts",
  "sweatpants",
  "skirt",
  "sneaker",
  "boot",
  "loafer",
  "dressshoe",
  "sandal",
  "cap",
  "beanie",
  "belt",
  "scarf",
  "sunglasses",
  "watch",
  "bag",
  "tote",
  "dress",
  "jumpsuit",
] as const;
export type SilhouetteId = (typeof SILHOUETTE_IDS)[number];

/**
 * The attributes a user chooses when creating a block. This is what the cart
 * add flow produces and what the server validates.
 */
export interface BlockInput {
  typeId: string;
  color: BlockColor;
  secondaryColor?: BlockColor;
  /** One of the type's fitOptions. Required for garments. */
  fit?: string;
  /** One of the type's variantOptions. Required for footwear and accessories. */
  variant?: string;
  material?: MaterialId;
  pattern: Pattern;
  /** Overrides the type's default weight. */
  weight?: Weight;
  /** How many near-identical pieces this block stands for. Default 1. */
  quantity: number;
  /** Optional nickname for a specific piece, e.g. "Uniqlo U". */
  nickname?: string;
  notes?: string;
}

/** Attributes derived from a BlockInput, stored denormalized for filtering. */
export interface DerivedAttributes {
  category: Category;
  /** 1 to 5. */
  warmth: number;
  /** 1 to 5. */
  formality: number;
  seasons: Season[];
  /** Effective weight after applying the override. */
  effectiveWeight: Weight;
  /**
   * Compact one-line description for prompts and captions,
   * e.g. "white relaxed cotton t-shirt" or "black chelsea leather boots".
   */
  label: string;
}

/** A persisted block as read back from the database. */
export interface Block extends BlockInput, DerivedAttributes {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}
