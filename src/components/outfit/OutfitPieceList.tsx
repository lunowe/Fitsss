import { sentenceCase } from "@/components/closet/labels";
import { InsetGroup, Row } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import { CATEGORY_LABELS, outfitBlockIds, type Block, type OutfitSlots } from "@/domain";

/** Every piece in an outfit, in wearing order, each linking to its closet page. */
export function OutfitPieceList({
  blocks,
  slots,
  className,
}: {
  blocks: Block[];
  slots: OutfitSlots;
  className?: string;
}) {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const pieces = outfitBlockIds(slots)
    .map((id) => byId.get(id))
    .filter((block): block is Block => block !== undefined);

  if (!pieces.length) return null;

  return (
    <InsetGroup className={className}>
      {pieces.map((block) => (
        <Row
          key={block.id}
          href={`/closet/${block.id}`}
          leading={
            <Silhouette
              typeId={block.typeId}
      variant={block.variant}
              color={block.color.hex}
              secondaryColor={block.secondaryColor?.hex}
              size={36}
            />
          }
          title={sentenceCase(block.label)}
          subtitle={CATEGORY_LABELS[block.category]}
        />
      ))}
    </InsetGroup>
  );
}
