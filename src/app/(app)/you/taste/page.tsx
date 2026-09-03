import type { Metadata } from "next";

import { typeLabelOf } from "@/components/closet/labels";
import { BackButton, LargeTitleHeader, Screen } from "@/components/shell";
import { TasteScreen, type TasteBlockInfo } from "@/components/taste/TasteScreen";
import { listBlocks } from "@/server/blocks-queries";
import { listStyles } from "@/server/styles-queries";
import { getTasteOverview } from "@/server/taste-queries";

export const metadata: Metadata = {
  title: "Taste",
};

export default async function TastePage() {
  const [overview, styles, blocks] = await Promise.all([
    getTasteOverview(),
    listStyles(),
    listBlocks(),
  ]);

  // The strips only ever reference pieces the user still owns, so the lookup is
  // built once here and the client just misses out archived ids.
  const blockInfo: Record<string, TasteBlockInfo> = {};
  for (const block of blocks) {
    blockInfo[block.id] = {
      id: block.id,
      // A tile is 72px wide, so the type reads better than the full label; the
      // whole thing is on the link's title.
      label: typeLabelOf(block),
      title: block.label,
      typeId: block.typeId,
      variant: block.variant,
      color: block.color.hex,
      secondaryColor: block.secondaryColor?.hex,
    };
  }

  const choices = overview.totalEvents;

  return (
    <Screen>
      <LargeTitleHeader
        leading={<BackButton href="/you" label="You" />}
        title="Taste"
        subtitle={`Learned from ${choices} ${choices === 1 ? "choice" : "choices"}`}
      />
      <TasteScreen
        overview={overview}
        styles={styles.map((style) => ({ id: style.id, name: style.name }))}
        blocks={blockInfo}
      />
    </Screen>
  );
}
