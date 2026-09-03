"use client";

import { typeLabelOf } from "@/components/closet/labels";
import { InsetGroup, Row } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import type { Block } from "@/domain";

export type PinnedBlock = Pick<
  Block,
  "id" | "label" | "typeId" | "variant" | "color" | "secondaryColor"
>;

/** "light blue shirt" — short enough to sit on one row next to "Remove". */
function shortLabel(block: PinnedBlock): string {
  return `${block.color.name.toLowerCase()} ${typeLabelOf(block).toLowerCase()}`;
}

/**
 * Shown when Today was opened from a piece ("Style this piece"): the outfit is
 * built around it until the user drops the pin.
 */
export function PinnedRow({ block, onRemove }: { block: PinnedBlock; onRemove: () => void }) {
  return (
    <div className="px-4">
      <InsetGroup>
        <Row
          leading={
            <span className="flex size-9 items-center justify-center rounded-lg bg-card-2">
              <Silhouette
                typeId={block.typeId}
                variant={block.variant}
                color={block.color.hex}
                secondaryColor={block.secondaryColor?.hex}
                size={26}
                title={block.label}
              />
            </span>
          }
          // The label is the point of the row, so it wraps rather than truncates.
          className="[&_.truncate]:whitespace-normal"
          title={`Styling around: ${shortLabel(block)}`}
          trailing={
            <button
              type="button"
              onClick={onRemove}
              className="-my-2 flex h-11 items-center rounded-lg px-1 text-body text-tint transition-opacity duration-150 active:opacity-50"
            >
              Remove
            </button>
          }
        />
      </InsetGroup>
    </div>
  );
}
