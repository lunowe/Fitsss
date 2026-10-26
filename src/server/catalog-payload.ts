import "server-only";

import { createHash } from "node:crypto";

import {
  COLOR_FAMILIES,
  COLOR_FAMILY_LABELS,
  DISLIKE_REASONS,
  MATERIALS,
  OCCASIONS,
  OUTFIT_SLOTS,
  PALETTE,
  PATTERN_LABELS,
  PATTERNS,
  SLOT_CATEGORY,
  WEATHER_CONDITION_LABELS,
  WEATHER_CONDITIONS,
  WEIGHT_LABELS,
  WEIGHTS,
  allPieceTypes,
  categoryIdOf,
  fitLabel,
  getArtOverride,
  listCategories,
  variantLabel,
  type CatalogCategory,
  type Category,
  type ColorFamily,
  type PieceType,
} from "@/domain";
import { ART } from "@/components/silhouettes/art";
import { GLYPHS } from "@/components/silhouettes/glyphs";
import { ART_FOR_TYPE } from "@/components/silhouettes/mapping";

/**
 * The whole catalog as one JSON document, for clients that cannot import
 * `src/domain` — the native app.
 *
 * It carries the vocabulary (categories, types and their options, labels,
 * palette) and the drawing for every type and variant, already resolved the
 * way `Silhouette` resolves it on the web: the user's own drawing, else the
 * built-in art, else the hand-drawn glyph. Glyphs are rewritten into the same
 * `var(--icon-*)` SVG convention as the art, so a client needs exactly one
 * renderer. Derivation inputs (base warmth, formality) stay on the server.
 *
 * Built from the module-level catalog registry, so the caller must have
 * applied the user's extension first (`withUser` does).
 */

export interface ArtPayload {
  viewBox: string;
  body: string;
}

export interface PieceTypePayload {
  id: string;
  /** Built-in role: drives outfit slots and weather. */
  role: Category;
  /** The category the type is filed under: a role or a custom slug. */
  categoryId: string;
  custom: boolean;
  label: string;
  plural: string;
  /** Present for garments, which are described by a fit. */
  fitOptions?: string[];
  /** Present for footwear and accessories, which are described by a variant. */
  variantOptions?: string[];
  materialOptions: string[];
  defaultWeight: string;
  /** Always includes `solid`. */
  patternOptions: string[];
  /** Palette ids, offered first. */
  suggestedColors: string[];
  /** Keys into `CatalogPayload.art`. `variants` lists only the variants that draw differently. */
  art: { default: string; variants?: Record<string, string> };
}

export interface CatalogPayload {
  /** Changes whenever anything below does; also sent as the ETag. */
  version: string;
  categories: CatalogCategory[];
  types: PieceTypePayload[];
  /** Label for every fit and variant id a type above offers. */
  fitLabels: Record<string, string>;
  variantLabels: Record<string, string>;
  materials: { id: string; label: string }[];
  patterns: { id: string; label: string }[];
  weights: { id: string; label: string }[];
  colorFamilies: { id: ColorFamily; label: string }[];
  palette: { id: string; name: string; hex: string; family: ColorFamily }[];
  art: Record<string, ArtPayload>;
  /** What Today steers by and what outfit feedback says. */
  occasions: { id: string; label: string; hint: string }[];
  weatherConditions: { id: string; label: string }[];
  dislikeReasons: { id: string; label: string }[];
  /** Outfit slots in display order, each with the role that fills it. Accessories are a list on top of these. */
  outfitSlots: { id: string; role: Category }[];
}

const STROKE = "var(--icon-stroke, #000)";
const FILL = "var(--icon-fill, #b3b3b3)";
const FILL_2 = "var(--icon-fill-2, #8c8c8c)";

/** Seam lines (creases, zips, laces) are open paths: outline only. */
const isSeam = (d: string) => !d.trimEnd().endsWith("Z");

function glyphPath(d: string, fill: string): string {
  return (
    `<path d="${d}" fill="${isSeam(d) ? "none" : fill}" stroke="${STROKE}" ` +
    `stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" ` +
    `vector-effect="non-scaling-stroke"/>`
  );
}

/** A hand-drawn glyph in the art convention. */
function glyphArt(icon: string): ArtPayload {
  const glyph = GLYPHS[icon as keyof typeof GLYPHS] ?? GLYPHS.tee;
  return {
    viewBox: glyph.viewBox ?? "0 0 64 64",
    body: [
      ...glyph.paths.map((d) => glyphPath(d, FILL)),
      ...(glyph.secondaryPaths ?? []).map((d) => glyphPath(d, FILL_2)),
    ].join(""),
  };
}

/** Resolves one type (and optionally variant) to an art key, registering the drawing. */
function resolveArt(type: PieceType, variant: string | undefined, art: Record<string, ArtPayload>): string {
  const override = getArtOverride(type.id, variant);
  if (override) {
    // Keyed by content so two overrides with the same drawing share a slot
    // and a changed drawing gets a fresh key (clients cache parsed art by key).
    const key = `user:${createHash("sha1").update(override.viewBox + override.body).digest("hex").slice(0, 12)}`;
    art[key] ??= { viewBox: override.viewBox, body: override.body };
    return key;
  }

  const mapping = ART_FOR_TYPE[type.id];
  const builtIn = (variant ? mapping?.variants?.[variant] : undefined) ?? mapping?.art;
  if (builtIn && ART[builtIn]) {
    art[builtIn] ??= ART[builtIn];
    return builtIn;
  }

  const key = `glyph:${type.icon}`;
  art[key] ??= glyphArt(type.icon);
  return key;
}

export function buildCatalogPayload(): CatalogPayload {
  const art: Record<string, ArtPayload> = {};
  const fitLabels: Record<string, string> = {};
  const variantLabels: Record<string, string> = {};

  const types = allPieceTypes().map((type): PieceTypePayload => {
    const base = resolveArt(type, undefined, art);
    const variants: Record<string, string> = {};
    for (const variant of type.variantOptions ?? []) {
      variantLabels[variant] = variantLabel(variant);
      const key = resolveArt(type, variant, art);
      if (key !== base) variants[variant] = key;
    }
    for (const fit of type.fitOptions ?? []) fitLabels[fit] = fitLabel(fit);

    const patternOptions = type.patternOptions.includes("solid")
      ? [...type.patternOptions]
      : ["solid", ...type.patternOptions];

    return {
      id: type.id,
      role: type.category,
      categoryId: categoryIdOf(type),
      custom: Boolean(type.custom),
      label: type.label,
      plural: type.plural,
      ...(type.fitOptions !== undefined
        ? { fitOptions: [...type.fitOptions] }
        : { variantOptions: [...(type.variantOptions ?? [])] }),
      materialOptions: [...type.materialOptions],
      defaultWeight: type.defaultWeight,
      patternOptions,
      suggestedColors: [...type.suggestedColors],
      art: Object.keys(variants).length ? { default: base, variants } : { default: base },
    };
  });

  const payload: Omit<CatalogPayload, "version"> = {
    categories: listCategories(),
    types,
    fitLabels,
    variantLabels,
    materials: MATERIALS.map(({ id, label }) => ({ id, label })),
    patterns: PATTERNS.map((id) => ({ id, label: PATTERN_LABELS[id] })),
    weights: WEIGHTS.map((id) => ({ id, label: WEIGHT_LABELS[id] })),
    colorFamilies: COLOR_FAMILIES.map((id) => ({ id, label: COLOR_FAMILY_LABELS[id] })),
    palette: PALETTE.map(({ id, name, hex, family }) => ({ id, name, hex, family })),
    art,
    occasions: OCCASIONS.map(({ id, label, hint }) => ({ id, label, hint })),
    weatherConditions: WEATHER_CONDITIONS.map((id) => ({ id, label: WEATHER_CONDITION_LABELS[id] })),
    dislikeReasons: DISLIKE_REASONS.map(({ id, label }) => ({ id, label })),
    outfitSlots: OUTFIT_SLOTS.map((id) => ({ id, role: SLOT_CATEGORY[id] })),
  };

  const version = createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  return { version, ...payload };
}
