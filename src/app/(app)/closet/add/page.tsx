import type { Metadata } from "next";
import { BackButton, InsetGroup, LargeTitleHeader, Row, Screen } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import { ROLE_FALLBACK_ICON, listCategories, pieceTypesForCategoryId } from "@/domain";
import { closetSummary } from "@/server/blocks-queries";
import { applyUserCatalog } from "@/server/catalog-queries";

export const metadata: Metadata = {
  title: "Add pieces",
};

export default async function AddPiecesPage() {
  await applyUserCatalog();
  const summary = await closetSummary();

  return (
    <Screen>
      <LargeTitleHeader
        title="Add pieces"
        subtitle="Pick a category, then a type"
        leading={<BackButton href="/closet" label="Closet" />}
      />
      <div className="px-4 pt-2">
        <InsetGroup>
          {listCategories().map((category) => {
            const first = pieceTypesForCategoryId(category.id)[0];
            const owned = summary.byCategoryId[category.id] ?? 0;
            return (
              <Row
                key={category.id}
                href={`/closet/add/${category.id}`}
                leading={
                  first ? (
                    <Silhouette typeId={first.id} color="var(--color-label-3)" size={32} />
                  ) : (
                    <Silhouette
                      id={ROLE_FALLBACK_ICON[category.role]}
                      color="var(--color-label-3)"
                      size={32}
                    />
                  )
                }
                title={category.label}
                subtitle={category.hint}
                trailing={<span className="tabular-nums">{owned}</span>}
              />
            );
          })}
        </InsetGroup>
      </div>
    </Screen>
  );
}
