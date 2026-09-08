import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton, LargeTitleHeader, Screen, SwatchDot } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import { CATEGORIES, getCatalogCategory, getPaletteColor, pieceTypesForCategoryId } from "@/domain";
import { applyUserCatalog } from "@/server/catalog-queries";

/** Only the built-ins are known at build time; custom slugs render on demand. */
export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps<"/closet/add/[category]">): Promise<Metadata> {
  const { category } = await params;
  await applyUserCatalog();
  const found = getCatalogCategory(category);
  return { title: found ? `Add ${found.label.toLowerCase()}` : "Add pieces" };
}

export default async function AddCategoryPage({ params }: PageProps<"/closet/add/[category]">) {
  const { category } = await params;
  await applyUserCatalog();
  const found = getCatalogCategory(category);
  if (!found) notFound();

  const types = pieceTypesForCategoryId(found.id);

  return (
    <Screen>
      <LargeTitleHeader
        title={found.label}
        subtitle={found.hint}
        leading={<BackButton href="/closet/add" label="Add" />}
      />
      {types.length === 0 ? (
        <p className="px-8 py-14 text-center text-callout text-label-2">
          Nothing in {found.label} yet. Add a piece type under You → Content.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pt-2">
          {types.map((type) => {
            const suggested = type.suggestedColors
              .slice(0, 4)
              .map(getPaletteColor)
              .filter((c) => c !== undefined);
            return (
              <Link
                key={type.id}
                href={`/closet/add/${found.id}/${type.id}`}
                className="flex flex-col items-center gap-2 rounded-xl bg-card px-3 py-4 transition-[transform,background-color] duration-150 ease-out active:scale-[0.98] active:bg-fill"
              >
                <Silhouette typeId={type.id} color="var(--color-label-3)" size={56} />
                <span className="w-full truncate text-center text-subhead font-medium">
                  {type.label}
                </span>
                <span className="flex items-center gap-1">
                  {suggested.map((c) => (
                    <SwatchDot key={c.id} hex={c.hex} size={10} />
                  ))}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
