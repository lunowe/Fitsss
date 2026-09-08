/**
 * Data-driven extension of the catalog.
 *
 * The built-in table in `./catalog` covers the wardrobe most people own. Past
 * that, a user can add their own categories ("Jewelry") and their own piece
 * types ("Kimono", "Necklace") without a code change: they are stored as rows
 * and folded into the same registry the built-ins live in, so `getPieceType`,
 * `derive`, `validateBlockInput` and every screen see them as ordinary types.
 *
 * This module is pure. It owns the shapes, the validators and the mapping from
 * a stored row to a `PieceType`. The registry itself (apply/clear/read) lives
 * in `./catalog` next to the built-in data it merges with.
 */

import { CATALOG, TOP_FITS } from "./catalog";
import { PALETTE } from "./colors";
import { isMaterialId } from "./materials";
import {
  CATEGORIES,
  PATTERNS,
  WEIGHTS,
  type Category,
  type MaterialId,
  type Pattern,
  type PieceType,
  type SilhouetteId,
  type Weight,
} from "./types";

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/** A category the user added, on top of the seven built-in ones. */
export interface CustomCategory {
  /** Stable slug, used as `categoryId` on piece types. */
  id: string;
  label: string;
  /** Short blurb under the name in the add flow. May be empty. */
  hint: string;
  /** The built-in category it behaves as in outfits and weather. */
  role: Category;
  sortOrder: number;
}

/** One drawing: the inner markup of an SVG plus its viewBox. */
export interface ArtOverride {
  viewBox: string;
  body: string;
}

/**
 * Everything one user added to the catalog. Applied as a unit; see
 * `applyCatalogExtension` in `./catalog`.
 */
export interface CatalogExtension {
  categories: CustomCategory[];
  /** Custom piece types, already shaped as `PieceType` with `categoryId`. */
  types: PieceType[];
  /** Keyed by `typeId` or `typeId#variant`. Overrides the built-in drawing. */
  art?: Record<string, ArtOverride>;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

/** Roles described by a fit. The rest (footwear, accessory) use variants. */
export const GARMENT_ROLES: readonly Category[] = [
  "top",
  "layer",
  "outerwear",
  "bottom",
  "fullbody",
];

export function isGarmentRole(role: Category): boolean {
  return GARMENT_ROLES.includes(role);
}

/**
 * The glyph a custom type draws with until it has artwork of its own. Neutral
 * on purpose: it says "a top", not "a t-shirt".
 */
export const ROLE_FALLBACK_ICON: Record<Category, SilhouetteId> = {
  top: "tee",
  layer: "sweater",
  outerwear: "jacket",
  bottom: "trousers",
  footwear: "sneaker",
  accessory: "bag",
  fullbody: "dress",
};

/** Fit or variant words already in use for a role, offered as suggestions. */
export function suggestedOptionsForRole(role: Category): string[] {
  const garment = isGarmentRole(role);
  const seen = new Set<string>();
  for (const type of CATALOG) {
    if (type.category !== role) continue;
    for (const option of (garment ? type.fitOptions : type.variantOptions) ?? []) seen.add(option);
  }
  if (seen.size === 0) {
    for (const option of garment ? TOP_FITS : []) seen.add(option);
  }
  return [...seen];
}

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

export const SLUG_RE = /^[a-z0-9-]{2,40}$/;
export const OPTION_RE = /^[a-z0-9-]{1,24}$/;
export const MAX_LABEL = 40;
export const MAX_HINT = 60;
export const MAX_OPTIONS = 12;
export const MAX_SUGGESTED_COLORS = 6;

const PALETTE_IDS: ReadonlySet<string> = new Set(PALETTE.map((c) => c.id));
const BUILT_IN_TYPE_IDS: ReadonlySet<string> = new Set(CATALOG.map((t) => t.id));
const BUILT_IN_CATEGORY_IDS: ReadonlySet<string> = new Set(CATEGORIES);

/** "Jewelry" -> "jewelry", "Rain shell" -> "rain-shell". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
}

/** 0 to 5 in half steps. Anything else is a typo, not a preference. */
function isHalfStep(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= 5 && Math.round(n * 2) === n * 2;
}

export interface CustomCategoryValue {
  slug: string;
  label: string;
  hint: string;
  role: Category;
}

/**
 * Validates one user category. `existingSlugs` are the user's other custom
 * category slugs; pass the list without the row being edited.
 */
export function validateCustomCategory(
  raw: unknown,
  existingSlugs: readonly string[] = [],
): Validated<CustomCategoryValue> {
  const errors: string[] = [];
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const label = asString(input.label).trim();
  if (!label) errors.push("A category needs a name");
  else if (label.length > MAX_LABEL) errors.push(`Keep the name under ${MAX_LABEL} characters`);

  const hint = asString(input.hint).trim().slice(0, MAX_HINT);

  const roleRaw = asString(input.role).trim();
  if (!(CATEGORIES as readonly string[]).includes(roleRaw)) {
    errors.push("Pick a role for this category");
  }
  const role = roleRaw as Category;

  const slug = asString(input.slug).trim() || slugify(label);
  if (!SLUG_RE.test(slug)) {
    errors.push("The name needs at least two letters or numbers");
  } else if (BUILT_IN_CATEGORY_IDS.has(slug)) {
    errors.push(`“${slug}” is a built-in category`);
  } else if (existingSlugs.includes(slug)) {
    errors.push("You already have a category with that name");
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { slug, label, hint, role } };
}

export interface CustomPieceTypeValue {
  slug: string;
  categoryId: string;
  role: Category;
  label: string;
  plural: string;
  fitOptions: string[];
  variantOptions: string[];
  materialOptions: MaterialId[];
  patternOptions: Pattern[];
  suggestedColors: string[];
  defaultWeight: Weight;
  baseWarmth: number;
  baseFormality: number;
}

/**
 * Validates one user piece type. The role decides whether it is described by a
 * fit or by a variant, and exactly one of the two lists may be filled in.
 * `existingSlugs` are the user's other custom type slugs.
 */
export function validateCustomPieceType(
  raw: unknown,
  existingSlugs: readonly string[] = [],
): Validated<CustomPieceTypeValue> {
  const errors: string[] = [];
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const label = asString(input.label).trim();
  if (!label) errors.push("A piece type needs a name");
  else if (label.length > MAX_LABEL) errors.push(`Keep the name under ${MAX_LABEL} characters`);

  const plural = asString(input.plural).trim() || (label ? `${label}s` : "");
  if (!plural) errors.push("A piece type needs a plural name");
  else if (plural.length > MAX_LABEL) errors.push(`Keep the plural under ${MAX_LABEL} characters`);

  const slug = asString(input.slug).trim() || slugify(label);
  if (!SLUG_RE.test(slug)) {
    errors.push("The name needs at least two letters or numbers");
  } else if (BUILT_IN_TYPE_IDS.has(slug)) {
    errors.push(`“${slug}” is a built-in piece type`);
  } else if (existingSlugs.includes(slug)) {
    errors.push("You already have a piece type with that name");
  }

  const roleRaw = asString(input.role).trim();
  if (!(CATEGORIES as readonly string[]).includes(roleRaw)) errors.push("Pick a category");
  const role = roleRaw as Category;

  const categoryId = asString(input.categoryId).trim() || roleRaw;
  if (!categoryId) errors.push("Pick a category");

  const garment = isGarmentRole(role);
  const fitOptions = uniq(asStringArray(input.fitOptions));
  const variantOptions = uniq(asStringArray(input.variantOptions));

  const options = garment ? fitOptions : variantOptions;
  const forbidden = garment ? variantOptions : fitOptions;
  const word = garment ? "fit" : "style";
  if (options.length === 0) errors.push(`Add at least one ${word}`);
  if (options.length > MAX_OPTIONS) errors.push(`Keep it to ${MAX_OPTIONS} ${word}s`);
  if (forbidden.length > 0) {
    errors.push(garment ? "Garments are described by fits, not styles" : "This category uses styles, not fits");
  }
  for (const option of options) {
    if (!OPTION_RE.test(option)) errors.push(`“${option}” is not a usable ${word} name`);
  }

  const materialOptions = uniq(asStringArray(input.materialOptions)).filter((m): m is MaterialId =>
    isMaterialId(m),
  );
  if (materialOptions.length === 0) errors.push("Pick at least one material");

  const patternOptions = uniq(asStringArray(input.patternOptions)).filter((p): p is Pattern =>
    (PATTERNS as readonly string[]).includes(p),
  );
  // Solid is always allowed; the editor locks it, and stored rows keep it first.
  const patterns: Pattern[] = ["solid", ...patternOptions.filter((p) => p !== "solid")];

  const suggestedColors = uniq(asStringArray(input.suggestedColors))
    .filter((id) => PALETTE_IDS.has(id))
    .slice(0, MAX_SUGGESTED_COLORS);

  const weightRaw = asString(input.defaultWeight).trim() || "mid";
  if (!(WEIGHTS as readonly string[]).includes(weightRaw)) errors.push("Pick a default weight");
  const defaultWeight = weightRaw as Weight;

  const baseWarmth = Number(input.baseWarmth);
  if (!isHalfStep(baseWarmth)) errors.push("Warmth runs from 0 to 5 in half steps");
  const baseFormality = Number(input.baseFormality);
  if (!isHalfStep(baseFormality)) errors.push("Formality runs from 0 to 5 in half steps");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      slug,
      categoryId,
      role,
      label,
      plural,
      fitOptions: garment ? fitOptions : [],
      variantOptions: garment ? [] : variantOptions,
      materialOptions,
      patternOptions: patterns,
      suggestedColors,
      defaultWeight,
      baseWarmth,
      baseFormality,
    },
  };
}

/** A validated row as the catalog sees it. */
export function pieceTypeFromCustom(value: CustomPieceTypeValue): PieceType {
  const garment = isGarmentRole(value.role);
  return {
    id: value.slug,
    category: value.role,
    categoryId: value.categoryId,
    custom: true,
    label: value.label,
    plural: value.plural,
    icon: ROLE_FALLBACK_ICON[value.role],
    ...(garment
      ? { fitOptions: value.fitOptions }
      : { variantOptions: value.variantOptions }),
    materialOptions: value.materialOptions,
    defaultWeight: value.defaultWeight,
    baseWarmth: value.baseWarmth,
    baseFormality: value.baseFormality,
    suggestedColors: value.suggestedColors,
    patternOptions: value.patternOptions,
  };
}
