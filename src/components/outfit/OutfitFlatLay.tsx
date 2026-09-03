import { Silhouette } from "@/components/silhouettes";
import type { Block, OutfitSlots } from "@/domain";
import { cn } from "@/lib/utils";

export type FlatLaySize = "sm" | "md" | "lg";

/** Silhouette size in px for the largest piece at each scale. */
const UNIT: Record<FlatLaySize, number> = { sm: 44, md: 66, lg: 100 };

const PADDING: Record<FlatLaySize, string> = { sm: "p-2", md: "p-3", lg: "p-4" };
const GAP: Record<FlatLaySize, string> = { sm: "gap-1", md: "gap-2", lg: "gap-3" };

/**
 * Relative size of each slot, so a coat always reads bigger than the tee next
 * to it and shoes stay small — the proportions of a real flat lay.
 */
const SCALE = {
  outerwear: 1,
  fullbody: 1.02,
  layer: 0.82,
  top: 0.78,
  bottom: 0.9,
  footwear: 0.58,
  accessory: 0.42,
} as const;

type Piece = { block: Block; px: number };

function pieceOf(byId: Map<string, Block>, id: string | undefined, unit: number, scale: number): Piece | null {
  const block = id ? byId.get(id) : undefined;
  return block ? { block, px: Math.round(unit * scale) } : null;
}

function Glyph({ block, px }: Piece) {
  return (
    <Silhouette
      typeId={block.typeId}
      variant={block.variant}
      color={block.color.hex}
      secondaryColor={block.secondaryColor?.hex}
      size={px}
      title={block.label}
    />
  );
}

/**
 * A flat lay of one outfit: outerwear largest on the left, layer and top beside
 * it, the bottom and shoes on the row below, accessories along the bottom edge.
 *
 * Laid out as fixed rows rather than absolute art positioning, so any subset of
 * slots composes and empty slots simply collapse. Props are plain data, so the
 * Today screen and the Looks grid can both render it.
 */
export function OutfitFlatLay({
  blocks,
  slots,
  size = "md",
  className,
}: {
  blocks: Block[];
  slots: OutfitSlots;
  size?: FlatLaySize;
  className?: string;
}) {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const unit = UNIT[size];

  const upper = [
    pieceOf(byId, slots.outerwear, unit, SCALE.outerwear),
    pieceOf(byId, slots.layer, unit, SCALE.layer),
    pieceOf(byId, slots.top, unit, SCALE.top),
    pieceOf(byId, slots.fullbody, unit, SCALE.fullbody),
  ].filter((piece): piece is Piece => piece !== null);

  const lower = [
    pieceOf(byId, slots.bottom, unit, SCALE.bottom),
    pieceOf(byId, slots.footwear, unit, SCALE.footwear),
  ].filter((piece): piece is Piece => piece !== null);

  const accessories = slots.accessories
    .map((id) => pieceOf(byId, id, unit, SCALE.accessory))
    .filter((piece): piece is Piece => piece !== null);

  return (
    <div
      className={cn(
        "flex aspect-square flex-col items-center justify-center overflow-hidden rounded-[10px] bg-card-2",
        PADDING[size],
        GAP[size],
        className,
      )}
    >
      {upper.length ? (
        <div className={cn("flex items-center justify-center", GAP[size])}>
          {upper.map((piece) => (
            <Glyph key={piece.block.id} {...piece} />
          ))}
        </div>
      ) : null}

      {lower.length ? (
        <div className={cn("flex items-end justify-center", GAP[size])}>
          {lower.map((piece) => (
            <Glyph key={piece.block.id} {...piece} />
          ))}
        </div>
      ) : null}

      {accessories.length ? (
        <div className={cn("flex flex-wrap items-center justify-center", GAP[size])}>
          {accessories.map((piece) => (
            <span
              key={piece.block.id}
              className={cn("flex items-center justify-center rounded-full bg-fill", size === "sm" ? "p-1" : "p-1.5")}
            >
              <Glyph {...piece} />
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
