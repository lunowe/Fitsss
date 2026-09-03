import Link from "next/link";

import type { Block, OutfitSlots } from "@/domain";

import { OutfitFlatLay } from "./OutfitFlatLay";

/** One outfit in a two-column grid. Tapping it opens the look's detail page. */
export function OutfitCard({
  blocks,
  slots,
  name,
  meta,
  href,
}: {
  blocks: Block[];
  slots: OutfitSlots;
  name: string;
  /** Quiet second line, e.g. "Everyday · 21°". */
  meta?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl bg-card p-2 transition-transform duration-150 ease-out active:scale-[0.98]"
    >
      <OutfitFlatLay blocks={blocks} slots={slots} size="sm" />
      <div className="px-1 pb-0.5 pt-2">
        <p className="truncate text-subhead font-medium text-label">{name}</p>
        {meta ? <p className="mt-0.5 truncate text-footnote text-label-2">{meta}</p> : null}
      </div>
    </Link>
  );
}
