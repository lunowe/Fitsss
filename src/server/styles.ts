"use server";

import { and, asc, count, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { styles } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { rowToStyle, type Style } from "@/server/styles-queries";
import { MAX_ACTIVE_STYLES, STYLE_LIMIT_ERROR, validateStyleInput } from "@/server/styles-validate";

export type StyleResult = { ok: true; style: Style } | { ok: false; errors: string[] };
export type StyleActionResult = { ok: true } | { ok: false; errors: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOT_FOUND = ["Style not found"];

function revalidate() {
  revalidatePath("/styles");
  revalidatePath("/today");
}

export async function createStyle(input: unknown): Promise<StyleResult> {
  const currentUser = await requireUser();
  const parsed = validateStyleInput(input);
  if (!parsed.ok) return parsed;

  const [{ value: active }] = await db
    .select({ value: count() })
    .from(styles)
    .where(and(eq(styles.userId, currentUser.id), isNull(styles.archivedAt)));

  if (active >= MAX_ACTIVE_STYLES) return { ok: false, errors: [STYLE_LIMIT_ERROR] };

  const [row] = await db
    .insert(styles)
    .values({
      userId: currentUser.id,
      name: parsed.value.name,
      description: parsed.value.description,
      rules: parsed.value.rules,
      sortOrder: active,
    })
    .returning();

  revalidate();
  return { ok: true, style: rowToStyle(row) };
}

export async function updateStyle(id: string, input: unknown): Promise<StyleResult> {
  const currentUser = await requireUser();
  const parsed = validateStyleInput(input);
  if (!parsed.ok) return parsed;
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .update(styles)
    .set({
      name: parsed.value.name,
      description: parsed.value.description,
      rules: parsed.value.rules,
      updatedAt: new Date(),
    })
    .where(and(eq(styles.id, id), eq(styles.userId, currentUser.id), isNull(styles.archivedAt)))
    .returning();

  if (!row) return { ok: false, errors: NOT_FOUND };

  revalidate();
  return { ok: true, style: rowToStyle(row) };
}

export async function archiveStyle(id: string): Promise<StyleActionResult> {
  const currentUser = await requireUser();
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .update(styles)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(styles.id, id), eq(styles.userId, currentUser.id), isNull(styles.archivedAt)))
    .returning({ id: styles.id });

  if (!row) return { ok: false, errors: NOT_FOUND };

  revalidate();
  return { ok: true };
}

/**
 * Rewrites `sortOrder` from the given order. Ids the user does not own are
 * ignored; styles the caller left out keep their relative order after the rest.
 */
export async function reorderStyles(ids: string[]): Promise<StyleActionResult> {
  const currentUser = await requireUser();
  if (!Array.isArray(ids)) return { ok: false, errors: ["Nothing to reorder"] };

  const rows = await db
    .select({ id: styles.id })
    .from(styles)
    .where(and(eq(styles.userId, currentUser.id), isNull(styles.archivedAt)))
    .orderBy(asc(styles.sortOrder), asc(styles.createdAt));

  const owned = new Set(rows.map((row) => row.id));
  const ordered: string[] = [];
  for (const id of ids) {
    if (typeof id === "string" && owned.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const row of rows) if (!ordered.includes(row.id)) ordered.push(row.id);

  await db.transaction(async (tx) => {
    for (const [index, id] of ordered.entries()) {
      await tx
        .update(styles)
        .set({ sortOrder: index })
        .where(and(eq(styles.id, id), eq(styles.userId, currentUser.id)));
    }
  });

  revalidate();
  return { ok: true };
}
