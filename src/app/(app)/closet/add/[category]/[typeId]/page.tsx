import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Configurator } from "@/components/closet/add/Configurator";
import { CATALOG, getPieceType } from "@/domain";

export function generateStaticParams() {
  return CATALOG.map((type) => ({ category: type.category, typeId: type.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/closet/add/[category]/[typeId]">): Promise<Metadata> {
  const { typeId } = await params;
  return { title: getPieceType(typeId)?.label ?? "Add pieces" };
}

export default async function ConfigurePiecePage({ params }: PageProps<"/closet/add/[category]/[typeId]">) {
  const { category, typeId } = await params;
  const type = getPieceType(typeId);
  if (!type || type.category !== category) notFound();

  return <Configurator type={type} />;
}
