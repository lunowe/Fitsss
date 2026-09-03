import { fitLabel, getPieceType, variantLabel } from "@/domain/catalog";
import { getMaterial } from "@/domain/materials";
import type { Block } from "@/domain/types";

/** Catalog label for a block's piece type, e.g. "T-shirt". */
export function typeLabelOf(block: Pick<Block, "typeId">): string {
  return getPieceType(block.typeId)?.label ?? block.typeId;
}

/**
 * The one word that qualifies the silhouette: a fit for garments, a style
 * variant for footwear and accessories. Empty when the type has neither.
 */
export function variationLabelOf(block: Pick<Block, "fit" | "variant">): string {
  if (block.fit) return fitLabel(block.fit);
  if (block.variant) return variantLabel(block.variant);
  return "";
}

export function materialLabelOf(block: Pick<Block, "material">): string {
  return block.material ? getMaterial(block.material).label : "";
}

/** "T-shirt · Relaxed" — the tile's first line. */
export function headlineOf(block: Pick<Block, "typeId" | "fit" | "variant">): string {
  const variation = variationLabelOf(block);
  return variation ? `${typeLabelOf(block)} · ${variation}` : typeLabelOf(block);
}

/** "White · Cotton" — the tile's second line, next to the swatch dot. */
export function colorLineOf(block: Pick<Block, "color" | "secondaryColor" | "material">): string {
  const colors = block.secondaryColor
    ? `${block.color.name} / ${block.secondaryColor.name}`
    : block.color.name;
  const material = materialLabelOf(block);
  return material ? `${colors} · ${material}` : colors;
}

/** Lowercase haystack a closet search query is matched against. */
export function searchHaystack(block: Block): string {
  return [
    block.label,
    block.nickname ?? "",
    block.color.name,
    block.secondaryColor?.name ?? "",
    typeLabelOf(block),
    variationLabelOf(block),
    materialLabelOf(block),
  ]
    .join(" ")
    .toLowerCase();
}

/** "black leather chelsea boots" → "Black leather chelsea boots". */
export function sentenceCase(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
