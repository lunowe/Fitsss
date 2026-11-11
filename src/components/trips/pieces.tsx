import { HelpCircle } from "lucide-react";

import { sentenceCase } from "@/components/closet/labels";
import { Silhouette } from "@/components/silhouettes";
import {
  CATEGORY_LABELS,
  SLOT_CATEGORY,
  type Block,
  type Category,
  type OutfitSlot,
  type OutfitSlots,
} from "@/domain";
import { cn } from "@/lib/utils";

/** A piece's drawing on a small `card-2` well, the size of a row's leading slot. */
export function PieceThumb({ block, dimmed = false }: { block?: Block; dimmed?: boolean }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card-2">
      {block ? (
        <span className={cn("flex", dimmed && "opacity-50")}>
          <Silhouette
            typeId={block.typeId}
            variant={block.variant}
            color={block.color.hex}
            secondaryColor={block.secondaryColor?.hex}
            fit={block.fit}
            pattern={block.pattern}
            patternColor={block.patternColor?.hex}
            size={32}
          />
        </span>
      ) : (
        <HelpCircle size={18} strokeWidth={1.75} className="text-label-3" aria-hidden />
      )}
    </span>
  );
}

/** The nickname when there is one, else the piece's label. */
export function pieceTitle(block: Block): string {
  return block.nickname?.trim() || sentenceCase(block.label);
}

/** The label under a nickname, else nothing. */
export function pieceSubtitle(block: Block): string | undefined {
  return block.nickname?.trim() ? sentenceCase(block.label) : undefined;
}

export type SwapSlot = OutfitSlot | "accessories";

/** One piece of a day's outfit, tagged with the slot it fills: what a swap needs. */
export interface PieceEntry {
  key: string;
  slot: SwapSlot;
  /** The category whose pieces may fill the slot. */
  role: Category;
  blockId: string;
  /** The piece, when the closet (active or archived) still knows it. */
  block?: Block;
  /** Still wearable: in the closet and not archived. */
  inCloset: boolean;
}

const SLOT_ORDER: readonly OutfitSlot[] = ["outerwear", "layer", "top", "fullbody", "bottom", "footwear"];

/** The outfit's pieces in wearing order, accessories last. A piece the closet lost keeps its row. */
export function pieceEntries(slots: OutfitSlots, byId: Map<string, Block>): PieceEntry[] {
  const entries: PieceEntry[] = [];
  for (const slot of SLOT_ORDER) {
    const id = slots[slot];
    if (!id) continue;
    const block = byId.get(id);
    entries.push({ key: slot, slot, role: SLOT_CATEGORY[slot], blockId: id, block, inCloset: Boolean(block && !block.archivedAt) });
  }
  for (const id of slots.accessories) {
    const block = byId.get(id);
    entries.push({
      key: `accessories:${id}`,
      slot: "accessories",
      role: "accessory",
      blockId: id,
      block,
      inCloset: Boolean(block && !block.archivedAt),
    });
  }
  return entries;
}

export function roleLabel(role: Category): string {
  return CATEGORY_LABELS[role];
}
