"use server";

import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { blocks, customCategories, customPieceTypes, pieceArt } from "@/db/schema";
import { validateCustomCategory, validateCustomPieceType } from "@/domain";
import { normalizeSvgArt } from "@/lib/art-normalize";
import { requireAdmin } from "@/lib/session";
import { invalidateCatalogExtension } from "@/server/catalog-queries";

export type ContentResult = { ok: true } | { ok: false; errors: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOT_FOUND = ["That is gone — pull to refresh"];

/** The catalog feeds the closet, the add flow and this screen. */
function revalidate(userId: string) {
  invalidateCatalogExtension(userId);
  revalidatePath("/closet");
  revalidatePath("/closet/add");
  revalidatePath("/you/content");
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export async function createCustomCategory(input: unknown): Promise<ContentResult> {
  const currentUser = await requireAdmin();

  const existing = await db
    .select({ slug: customCategories.slug })
    .from(customCategories)
    .where(and(eq(customCategories.userId, currentUser.id), isNull(customCategories.archivedAt)));

  const parsed = validateCustomCategory(input, existing.map((row) => row.slug));
  if (!parsed.ok) return parsed;

  await db.insert(customCategories).values({
    userId: currentUser.id,
    slug: parsed.value.slug,
    label: parsed.value.label,
    hint: parsed.value.hint,
    role: parsed.value.role,
    sortOrder: existing.length,
  });

  revalidate(currentUser.id);
  return { ok: true };
}

/**
 * Label, hint and role are editable; the slug is not, because piece types
 * point at it.
 */
export async function updateCustomCategory(id: string, input: unknown): Promise<ContentResult> {
  const currentUser = await requireAdmin();
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .select()
    .from(customCategories)
    .where(
      and(
        eq(customCategories.id, id),
        eq(customCategories.userId, currentUser.id),
        isNull(customCategories.archivedAt),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, errors: NOT_FOUND };

  const parsed = validateCustomCategory({ ...(input as object), slug: row.slug });
  if (!parsed.ok) return parsed;

  await db
    .update(customCategories)
    .set({
      label: parsed.value.label,
      hint: parsed.value.hint,
      role: parsed.value.role,
      updatedAt: new Date(),
    })
    .where(eq(customCategories.id, id));

  revalidate(currentUser.id);
  return { ok: true };
}

export async function archiveCustomCategory(id: string): Promise<ContentResult> {
  const currentUser = await requireAdmin();
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .select({ slug: customCategories.slug, label: customCategories.label })
    .from(customCategories)
    .where(
      and(
        eq(customCategories.id, id),
        eq(customCategories.userId, currentUser.id),
        isNull(customCategories.archivedAt),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, errors: NOT_FOUND };

  const [{ value: inUse }] = await db
    .select({ value: count() })
    .from(customPieceTypes)
    .where(
      and(
        eq(customPieceTypes.userId, currentUser.id),
        eq(customPieceTypes.categoryId, row.slug),
        isNull(customPieceTypes.archivedAt),
      ),
    );

  if (inUse > 0) {
    return {
      ok: false,
      errors: [
        `${row.label} still holds ${inUse} piece ${inUse === 1 ? "type" : "types"}. Move or delete ${inUse === 1 ? "it" : "them"} first.`,
      ],
    };
  }

  await db
    .update(customCategories)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(customCategories.id, id));

  revalidate(currentUser.id);
  return { ok: true };
}

export async function reorderCustomCategories(ids: string[]): Promise<ContentResult> {
  const currentUser = await requireAdmin();
  if (!Array.isArray(ids)) return { ok: false, errors: ["Nothing to reorder"] };

  const rows = await db
    .select({ id: customCategories.id })
    .from(customCategories)
    .where(and(eq(customCategories.userId, currentUser.id), isNull(customCategories.archivedAt)))
    .orderBy(asc(customCategories.sortOrder), asc(customCategories.createdAt));

  const ordered = orderOwned(ids, rows);

  await db.transaction(async (tx) => {
    for (const [index, id] of ordered.entries()) {
      await tx
        .update(customCategories)
        .set({ sortOrder: index })
        .where(and(eq(customCategories.id, id), eq(customCategories.userId, currentUser.id)));
    }
  });

  revalidate(currentUser.id);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Piece types                                                         */
/* ------------------------------------------------------------------ */

export async function createCustomPieceType(input: unknown): Promise<ContentResult> {
  const currentUser = await requireAdmin();

  const existing = await db
    .select({ slug: customPieceTypes.slug })
    .from(customPieceTypes)
    .where(and(eq(customPieceTypes.userId, currentUser.id), isNull(customPieceTypes.archivedAt)));

  const parsed = validateCustomPieceType(input, existing.map((row) => row.slug));
  if (!parsed.ok) return parsed;

  const value = parsed.value;
  await db.insert(customPieceTypes).values({
    userId: currentUser.id,
    slug: value.slug,
    categoryId: value.categoryId,
    role: value.role,
    label: value.label,
    plural: value.plural,
    fitOptions: value.fitOptions,
    variantOptions: value.variantOptions,
    materialOptions: value.materialOptions,
    patternOptions: value.patternOptions,
    suggestedColors: value.suggestedColors,
    defaultWeight: value.defaultWeight,
    baseWarmth: value.baseWarmth,
    baseFormality: value.baseFormality,
    sortOrder: existing.length,
  });

  revalidate(currentUser.id);
  return { ok: true };
}

/** Everything but the slug is editable: blocks store the slug as their typeId. */
export async function updateCustomPieceType(id: string, input: unknown): Promise<ContentResult> {
  const currentUser = await requireAdmin();
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .select()
    .from(customPieceTypes)
    .where(
      and(
        eq(customPieceTypes.id, id),
        eq(customPieceTypes.userId, currentUser.id),
        isNull(customPieceTypes.archivedAt),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, errors: NOT_FOUND };

  const parsed = validateCustomPieceType({ ...(input as object), slug: row.slug });
  if (!parsed.ok) return parsed;

  const value = parsed.value;
  await db
    .update(customPieceTypes)
    .set({
      categoryId: value.categoryId,
      role: value.role,
      label: value.label,
      plural: value.plural,
      fitOptions: value.fitOptions,
      variantOptions: value.variantOptions,
      materialOptions: value.materialOptions,
      patternOptions: value.patternOptions,
      suggestedColors: value.suggestedColors,
      defaultWeight: value.defaultWeight,
      baseWarmth: value.baseWarmth,
      baseFormality: value.baseFormality,
      updatedAt: new Date(),
    })
    .where(eq(customPieceTypes.id, id));

  revalidate(currentUser.id);
  return { ok: true };
}

export async function archiveCustomPieceType(id: string): Promise<ContentResult> {
  const currentUser = await requireAdmin();
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .select({ slug: customPieceTypes.slug, label: customPieceTypes.label })
    .from(customPieceTypes)
    .where(
      and(
        eq(customPieceTypes.id, id),
        eq(customPieceTypes.userId, currentUser.id),
        isNull(customPieceTypes.archivedAt),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, errors: NOT_FOUND };

  const [used] = await db
    .select({ value: sql<number>`coalesce(sum(${blocks.quantity}), 0)::int` })
    .from(blocks)
    .where(
      and(
        eq(blocks.userId, currentUser.id),
        eq(blocks.typeId, row.slug),
        isNull(blocks.archivedAt),
      ),
    );

  const inUse = Number(used?.value ?? 0);
  if (inUse > 0) {
    return {
      ok: false,
      errors: [
        `${inUse} ${inUse === 1 ? "piece" : "pieces"} in your closet ${inUse === 1 ? "is" : "are"} a ${row.label}. Archive ${inUse === 1 ? "it" : "them"} first.`,
      ],
    };
  }

  await db
    .update(customPieceTypes)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(customPieceTypes.id, id));

  revalidate(currentUser.id);
  return { ok: true };
}

export async function reorderCustomPieceTypes(ids: string[]): Promise<ContentResult> {
  const currentUser = await requireAdmin();
  if (!Array.isArray(ids)) return { ok: false, errors: ["Nothing to reorder"] };

  const rows = await db
    .select({ id: customPieceTypes.id })
    .from(customPieceTypes)
    .where(and(eq(customPieceTypes.userId, currentUser.id), isNull(customPieceTypes.archivedAt)))
    .orderBy(asc(customPieceTypes.sortOrder), asc(customPieceTypes.createdAt));

  const ordered = orderOwned(ids, rows);

  await db.transaction(async (tx) => {
    for (const [index, id] of ordered.entries()) {
      await tx
        .update(customPieceTypes)
        .set({ sortOrder: index })
        .where(and(eq(customPieceTypes.id, id), eq(customPieceTypes.userId, currentUser.id)));
    }
  });

  revalidate(currentUser.id);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Artwork                                                             */
/* ------------------------------------------------------------------ */

/**
 * Stores one drawing for a piece type, optionally narrowed to a variant.
 * The SVG is normalized to the tinting convention before it is saved, so what
 * lands in the database is already safe to inline.
 */
export async function setPieceArt(input: {
  typeId: string;
  variant?: string | null;
  svg: string;
  source?: string;
}): Promise<ContentResult> {
  const currentUser = await requireAdmin();

  const typeId = typeof input?.typeId === "string" ? input.typeId.trim() : "";
  if (!typeId) return { ok: false, errors: ["Pick a piece type"] };
  const variant =
    typeof input?.variant === "string" && input.variant.trim() ? input.variant.trim() : null;
  const source = input?.source === "generated" ? "generated" : "uploaded";

  const parsed = normalizeSvgArt(input?.svg);
  if (!parsed.ok) return parsed;

  const [existing] = await db
    .select({ id: pieceArt.id })
    .from(pieceArt)
    .where(
      and(
        eq(pieceArt.userId, currentUser.id),
        eq(pieceArt.typeId, typeId),
        variant ? eq(pieceArt.variant, variant) : isNull(pieceArt.variant),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(pieceArt)
      .set({
        viewBox: parsed.value.viewBox,
        body: parsed.value.body,
        source,
        updatedAt: new Date(),
      })
      .where(eq(pieceArt.id, existing.id));
  } else {
    await db.insert(pieceArt).values({
      userId: currentUser.id,
      typeId,
      variant,
      viewBox: parsed.value.viewBox,
      body: parsed.value.body,
      source,
    });
  }

  revalidate(currentUser.id);
  return { ok: true };
}

/** Removes an override; a built-in type falls back to its own drawing. */
export async function deletePieceArt(id: string): Promise<ContentResult> {
  const currentUser = await requireAdmin();
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .delete(pieceArt)
    .where(and(eq(pieceArt.id, id), eq(pieceArt.userId, currentUser.id)))
    .returning({ id: pieceArt.id });

  if (!row) return { ok: false, errors: NOT_FOUND };

  revalidate(currentUser.id);
  return { ok: true };
}

/* ------------------------------------------------------------------ */

/**
 * Ids the user does not own are ignored; rows the caller left out keep their
 * relative order after the rest.
 */
function orderOwned(ids: string[], rows: { id: string }[]): string[] {
  const owned = new Set(rows.map((row) => row.id));
  const ordered: string[] = [];
  for (const id of ids) {
    if (typeof id === "string" && owned.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const row of rows) if (!ordered.includes(row.id)) ordered.push(row.id);
  return ordered;
}
