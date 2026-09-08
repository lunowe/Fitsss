import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { blocks, customCategories, customPieceTypes, pieceArt } from "@/db/schema";
import { CATEGORIES, type Category, type MaterialId, type Pattern, type Weight } from "@/domain";
import { requireUser } from "@/lib/session";

/** A custom category row, as the content screen edits it. */
export interface CustomCategoryRecord {
  id: string;
  slug: string;
  label: string;
  hint: string;
  role: Category;
  sortOrder: number;
}

/** A custom piece type row, as the content screen edits it. */
export interface CustomPieceTypeRecord {
  id: string;
  slug: string;
  categoryId: string;
  role: Category;
  label: string;
  plural: string;
  fitOptions: string[];
  variantOptions: string[];
  materialOptions: MaterialId[];
  patternOptions: Pattern[];
  suggestedColors: string[];
  defaultWeight: Weight;
  baseWarmth: number;
  baseFormality: number;
  sortOrder: number;
}

/** One stored drawing. `body` is left out: the screen only needs to know it exists. */
export interface PieceArtRecord {
  id: string;
  typeId: string;
  variant: string | null;
  source: string;
  updatedAt: Date;
}

export async function listCustomCategories(): Promise<CustomCategoryRecord[]> {
  const currentUser = await requireUser();
  const rows = await db
    .select()
    .from(customCategories)
    .where(and(eq(customCategories.userId, currentUser.id), isNull(customCategories.archivedAt)))
    .orderBy(asc(customCategories.sortOrder), asc(customCategories.createdAt));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    hint: row.hint,
    role: row.role as Category,
    sortOrder: row.sortOrder,
  }));
}

export async function listCustomPieceTypes(): Promise<CustomPieceTypeRecord[]> {
  const currentUser = await requireUser();
  const rows = await db
    .select()
    .from(customPieceTypes)
    .where(and(eq(customPieceTypes.userId, currentUser.id), isNull(customPieceTypes.archivedAt)))
    .orderBy(asc(customPieceTypes.sortOrder), asc(customPieceTypes.createdAt));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    categoryId: row.categoryId,
    role: row.role as Category,
    label: row.label,
    plural: row.plural,
    fitOptions: row.fitOptions ?? [],
    variantOptions: row.variantOptions ?? [],
    materialOptions: row.materialOptions as MaterialId[],
    patternOptions: row.patternOptions as Pattern[],
    suggestedColors: row.suggestedColors,
    defaultWeight: row.defaultWeight as Weight,
    baseWarmth: row.baseWarmth,
    baseFormality: row.baseFormality,
    sortOrder: row.sortOrder,
  }));
}

export async function listPieceArt(): Promise<PieceArtRecord[]> {
  const currentUser = await requireUser();
  const rows = await db
    .select({
      id: pieceArt.id,
      typeId: pieceArt.typeId,
      variant: pieceArt.variant,
      source: pieceArt.source,
      updatedAt: pieceArt.updatedAt,
    })
    .from(pieceArt)
    .where(eq(pieceArt.userId, currentUser.id))
    .orderBy(asc(pieceArt.typeId));

  return rows;
}

/** How many active pieces each piece type is used by. Keyed by type id. */
export async function blockCountsByType(): Promise<Record<string, number>> {
  const currentUser = await requireUser();
  const rows = await db
    .select({ typeId: blocks.typeId, total: sql<number>`sum(${blocks.quantity})::int` })
    .from(blocks)
    .where(and(eq(blocks.userId, currentUser.id), isNull(blocks.archivedAt)))
    .groupBy(blocks.typeId);

  return Object.fromEntries(rows.map((row) => [row.typeId, Number(row.total)]));
}

/** Counts for the content screen's summary rows. */
export async function getContentOverview(): Promise<{
  builtInCategories: number;
  customCategories: number;
  customTypes: number;
  customArt: number;
}> {
  const [categories, types, art] = await Promise.all([
    listCustomCategories(),
    listCustomPieceTypes(),
    listPieceArt(),
  ]);

  return {
    builtInCategories: CATEGORIES.length,
    customCategories: categories.length,
    customTypes: types.length,
    customArt: art.length,
  };
}
