import type { Metadata } from "next";

import { ContentScreen } from "@/components/content/ContentScreen";
import { BackButton, LargeTitleHeader, Screen } from "@/components/shell";
import { ART } from "@/components/silhouettes";
import { requireAdmin } from "@/lib/session";
import { applyUserCatalog } from "@/server/catalog-queries";
import {
  blockCountsByType,
  listCustomCategories,
  listCustomPieceTypes,
  listPieceArt,
} from "@/server/content-queries";

export const metadata: Metadata = {
  title: "Content",
};

/** The number of drawings that ship with the app. */
const BUILT_IN_ART_COUNT = Object.keys(ART).length;

export default async function ContentPage() {
  await requireAdmin();
  await applyUserCatalog();
  const [categories, types, art, usage] = await Promise.all([
    listCustomCategories(),
    listCustomPieceTypes(),
    listPieceArt(),
    blockCountsByType(),
  ]);

  const summary =
    categories.length + types.length === 0
      ? "The catalog the closet is built from"
      : `${categories.length} own ${categories.length === 1 ? "category" : "categories"} · ${types.length} own ${types.length === 1 ? "type" : "types"}`;

  return (
    <Screen>
      <LargeTitleHeader
        title="Content"
        subtitle={summary}
        leading={<BackButton href="/you" label="You" />}
      />
      <ContentScreen
        categories={categories}
        types={types}
        art={art}
        usage={usage}
        builtInArtCount={BUILT_IN_ART_COUNT}
      />
    </Screen>
  );
}
