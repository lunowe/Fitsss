import Link from "next/link";

import { SwatchDot } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import type { Block } from "@/domain/types";
import { cn } from "@/lib/utils";

import { colorLineOf, headlineOf } from "./labels";

/**
 * The square, card-2 coloured well a piece's silhouette sits in. Shared by the
 * closet grid tile and the item detail hero so both read as the same object.
 */
export function BlockThumb({
  block,
  size = 72,
  className,
  children,
}: {
  block: Pick<Block, "typeId" | "variant" | "color" | "secondaryColor" | "label">;
  /** Silhouette size in px. */
  size?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-card-2",
        className,
      )}
    >
      <Silhouette
        typeId={block.typeId}
        variant={block.variant}
        color={block.color.hex}
        secondaryColor={block.secondaryColor?.hex}
        size={size}
        title={block.label}
      />
      {children}
    </div>
  );
}

/** One piece in the closet grid. Tapping it opens the item detail page. */
export function BlockTile({ block }: { block: Block }) {
  return (
    <Link
      href={`/closet/${block.id}`}
      className="block rounded-xl bg-card p-2 transition-transform duration-150 ease-out active:scale-[0.98]"
    >
      <BlockThumb block={block}>
        {block.quantity > 1 ? (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-fill px-1.5 py-0.5 text-caption font-medium tabular-nums text-label-2">
            ×{block.quantity}
          </span>
        ) : null}
      </BlockThumb>
      <div className="px-1 pb-0.5 pt-2">
        <p className="truncate text-subhead font-medium text-label">{headlineOf(block)}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-footnote text-label-2">
          <SwatchDot
            hex={block.color.hex}
            secondaryHex={block.secondaryColor?.hex}
            size={10}
            className="ring-1 ring-inset ring-separator"
          />
          <span className="truncate">{colorLineOf(block)}</span>
        </p>
      </div>
    </Link>
  );
}
