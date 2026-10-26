import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { customCategories, customPieceTypes, pieceArt } from "@/db/schema";
import {
  applyCatalogExtension,
  artOverrideKey,
  clearCatalogExtension,
  pieceTypeFromCustom,
  type ArtOverride,
  type CatalogExtension,
  type Category,
  type CustomCategory,
  type MaterialId,
  type Pattern,
  type PieceType,
  type Weight,
} from "@/domain";
import { getSession, requireUser } from "@/lib/session";

type CategoryRow = typeof customCategories.$inferSelect;
type PieceTypeRow = typeof customPieceTypes.$inferSelect;
type ArtRow = typeof pieceArt.$inferSelect;

const EMPTY: CatalogExtension = { categories: [], types: [], art: {} };

export function rowToCustomCategory(row: CategoryRow): CustomCategory {
  return {
    id: row.slug,
    label: row.label,
    hint: row.hint,
    role: row.role as Category,
    sortOrder: row.sortOrder,
  };
}

export function rowToPieceType(row: PieceTypeRow): PieceType {
  return pieceTypeFromCustom({
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
  });
}

export function rowToArtOverride(row: ArtRow): [string, ArtOverride] {
  return [artOverrideKey(row.typeId, row.variant), { viewBox: row.viewBox, body: row.body }];
}

/* ------------------------------------------------------------------ */
/* Loading and caching                                                  */
/* ------------------------------------------------------------------ */

/**
 * The extension changes only when the user edits it on /you/content, and every
 * request that touches the catalog needs it, so it is held in memory for a
 * minute and dropped explicitly by the content actions.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; extension: CatalogExtension }>();

/** Called by every mutation in `src/server/content.ts`. */
export function invalidateCatalogExtension(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export async function loadCatalogExtension(userId: string): Promise<CatalogExtension> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.extension;

  const [categoryRows, typeRows, artRows] = await Promise.all([
    db
      .select()
      .from(customCategories)
      .where(and(eq(customCategories.userId, userId), isNull(customCategories.archivedAt)))
      .orderBy(asc(customCategories.sortOrder), asc(customCategories.createdAt)),
    db
      .select()
      .from(customPieceTypes)
      .where(and(eq(customPieceTypes.userId, userId), isNull(customPieceTypes.archivedAt)))
      .orderBy(asc(customPieceTypes.sortOrder), asc(customPieceTypes.createdAt)),
    db.select().from(pieceArt).where(eq(pieceArt.userId, userId)),
  ]);

  const extension: CatalogExtension = {
    categories: categoryRows.map(rowToCustomCategory),
    types: typeRows.map(rowToPieceType),
    art: Object.fromEntries(artRows.map(rowToArtOverride)),
  };

  cache.set(userId, { at: Date.now(), extension });
  return extension;
}

/**
 * Applies the user's extension to the module-level catalog registry and runs
 * `fn` with it in place. The extension is left applied afterwards: Fitsss is a
 * single-user app, so every concurrent request in this process belongs to the
 * same person and shares the same catalog.
 */
export async function withCatalog<T>(userId: string, fn: () => Promise<T> | T): Promise<T> {
  applyCatalogExtension(await loadCatalogExtension(userId));
  return fn();
}

/** Applies the signed-in user's extension. Safe to call more than once. */
export async function applyUserCatalog(): Promise<CatalogExtension> {
  const currentUser = await requireUser();
  return applyUserCatalogFor(currentUser.id);
}

/** Same, for callers that already know the user — core functions and routes. */
export async function applyUserCatalogFor(userId: string): Promise<CatalogExtension> {
  const extension = await loadCatalogExtension(userId);
  applyCatalogExtension(extension);
  return extension;
}

/** Same, but for routes that render without a session (the dev gallery). */
export async function applyOptionalUserCatalog(): Promise<CatalogExtension> {
  const session = await getSession();
  if (!session) {
    clearCatalogExtension();
    return EMPTY;
  }
  const extension = await loadCatalogExtension(session.user.id);
  applyCatalogExtension(extension);
  return extension;
}
