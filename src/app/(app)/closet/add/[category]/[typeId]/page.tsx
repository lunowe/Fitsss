import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Configurator } from "@/components/closet/add/Configurator";
import { CATALOG, categoryIdOf, getPieceType } from "@/domain";
import { applyUserCatalog } from "@/server/catalog-queries";

/** Built-ins are prerenderable; custom types render on demand. */
export function generateStaticParams() {
  return CATALOG.map((type) => ({ category: type.category, typeId: type.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/closet/add/[category]/[typeId]">): Promise<Metadata> {
  const { typeId } = await params;
  await applyUserCatalog();
  return { title: getPieceType(typeId)?.label ?? "Add pieces" };
}

export default async function ConfigurePiecePage({ params }: PageProps<"/closet/add/[category]/[typeId]">) {
  const { category, typeId } = await params;
  await applyUserCatalog();
  const type = getPieceType(typeId);
  if (!type || categoryIdOf(type) !== category) notFound();

  return <Configurator type={type} />;
}
