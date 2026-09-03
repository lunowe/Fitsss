import { LOOSE_FITS, fitLabel, requirePieceType, variantLabel } from "./catalog";
import { getMaterial } from "./materials";
import {
  PATTERN_LABELS,
  SEASONS,
  WEIGHTS,
  type BlockInput,
  type DerivedAttributes,
  type Pattern,
  type Season,
  type Weight,
} from "./types";

const clamp15 = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

const PATTERN_FORMALITY: Record<Pattern, number> = {
  solid: 0,
  stripe: 0,
  check: 0,
  textured: 0,
  print: -0.5,
  colorblock: -0.5,
  graphic: -1,
  logo: -1,
};

function weightIndex(w: Weight): number {
  return WEIGHTS.indexOf(w);
}

/** Warmth 1..5 for a block. The type's base assumes its default weight. */
export function deriveWarmth(input: BlockInput): number {
  const type = requirePieceType(input.typeId);
  if (type.baseWarmth === 0) return 1;
  const weight = input.weight ?? type.defaultWeight;
  const weightAdj = weightIndex(weight) - weightIndex(type.defaultWeight);
  const materialAdj = input.material ? getMaterial(input.material).warmth : 0;
  return clamp15(type.baseWarmth + weightAdj + materialAdj);
}

/** Formality 1..5 for a block. */
export function deriveFormality(input: BlockInput): number {
  const type = requirePieceType(input.typeId);
  const materialAdj = input.material ? getMaterial(input.material).formality : 0;
  const patternAdj = PATTERN_FORMALITY[input.pattern] ?? 0;
  const fitAdj = input.fit && LOOSE_FITS.has(input.fit) ? -0.5 : 0;
  return clamp15(type.baseFormality + materialAdj + patternAdj + fitAdj);
}

/** Seasons in which a block is comfortable to wear, from its warmth. */
export function seasonsForWarmth(warmth: number, seasonNeutral = false): Season[] {
  if (seasonNeutral) return [...SEASONS];
  switch (clamp15(warmth)) {
    case 1:
      return ["spring", "summer"];
    case 2:
      return ["spring", "summer", "autumn"];
    case 3:
      return ["spring", "autumn"];
    case 4:
      return ["autumn", "winter"];
    default:
      return ["winter"];
  }
}

/**
 * One-line description used in captions and prompts.
 * Garments: "{color} {pattern} {fit} {material} {type}"  → "white relaxed cotton t-shirt"
 * Footwear/accessories: "{color} {material} {variant} {type}" → "black leather chelsea boots"
 */
export function deriveLabel(input: BlockInput): string {
  const type = requirePieceType(input.typeId);
  const parts: string[] = [input.color.name.toLowerCase()];
  if (input.secondaryColor) parts.push(`and ${input.secondaryColor.name.toLowerCase()}`);
  if (input.pattern !== "solid") parts.push(PATTERN_LABELS[input.pattern].toLowerCase().split(" ")[0]);
  const material = input.material ? getMaterial(input.material).label.toLowerCase() : null;
  if (input.fit) {
    parts.push(fitLabel(input.fit).toLowerCase());
    if (material) parts.push(material);
  } else {
    if (material) parts.push(material);
    if (input.variant) {
      const v = variantLabel(input.variant).toLowerCase();
      // "wool wool scarf", "leather leather belt": skip a variant that repeats the material.
      if (v !== material) parts.push(v);
    }
  }
  parts.push(type.label.toLowerCase());
  return parts.join(" ");
}

export function derive(input: BlockInput): DerivedAttributes {
  const type = requirePieceType(input.typeId);
  const warmth = deriveWarmth(input);
  return {
    category: type.category,
    warmth,
    formality: deriveFormality(input),
    seasons: seasonsForWarmth(warmth, type.baseWarmth === 0),
    effectiveWeight: input.weight ?? type.defaultWeight,
    label: deriveLabel(input),
  };
}
