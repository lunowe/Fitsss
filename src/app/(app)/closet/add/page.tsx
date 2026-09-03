import type { Metadata } from "next";
import { BackButton, InsetGroup, LargeTitleHeader, Row, Screen } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import { CATEGORIES, CATEGORY_HINTS, CATEGORY_LABELS, pieceTypesFor } from "@/domain";
import { closetSummary } from "@/server/blocks-queries";

export const metadata: Metadata = {
  title: "Add pieces",
};

export default async function AddPiecesPage() {
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
          {CATEGORIES.map((category) => {
            const first = pieceTypesFor(category)[0];
            const owned = summary.byCategory[category];
            return (
              <Row
                key={category}
                href={`/closet/add/${category}`}
                leading={
                  first ? (
                    <Silhouette typeId={first.id} color="var(--color-label-3)" size={32} />
                  ) : null
                }
                title={CATEGORY_LABELS[category]}
                subtitle={CATEGORY_HINTS[category]}
                trailing={<span className="tabular-nums">{owned}</span>}
              />
            );
          })}
        </InsetGroup>
      </div>
    </Screen>
  );
}
