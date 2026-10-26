import "server-only";

import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { styles } from "@/db/schema";
import { rowToStyle, type Style } from "@/server/styles-queries";
import { MAX_ACTIVE_STYLES, STYLE_LIMIT_ERROR, validateStyleInput } from "@/server/styles-validate";

/**
 * The styles' writes, taking the user explicitly, shared by the server
 * actions in `styles.ts` and the `/api/v1/styles` handlers. Cache
 * invalidation belongs to the caller.
 */

export type StyleResult = { ok: true; style: Style } | { ok: false; errors: string[] };
export type StyleActionResult = { ok: true } | { ok: false; errors: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOT_FOUND = ["Style not found"];

export async function createStyleForUser(userId: string, input: unknown): Promise<StyleResult> {
  const parsed = validateStyleInput(input);
  if (!parsed.ok) return parsed;

  // Count and insert under a per-user lock, so two concurrent creates at
  // five styles can't both see room for a sixth.
  return db.transaction(async (tx): Promise<StyleResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`styles:${userId}`}))`);
    const [{ value: active }] = await tx
      .select({ value: count() })
      .from(styles)
      .where(and(eq(styles.userId, userId), isNull(styles.archivedAt)));

    if (active >= MAX_ACTIVE_STYLES) return { ok: false, errors: [STYLE_LIMIT_ERROR] };

    const [row] = await tx
      .insert(styles)
      .values({
        userId: userId,
        name: parsed.value.name,
        description: parsed.value.description,
        rules: parsed.value.rules,
        sortOrder: active,
      })
      .returning();

    return { ok: true, style: rowToStyle(row) };
  });
}

export async function updateStyleForUser(userId: string, id: string, input: unknown): Promise<StyleResult> {
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
    .where(and(eq(styles.id, id), eq(styles.userId, userId), isNull(styles.archivedAt)))
    .returning();

  if (!row) return { ok: false, errors: NOT_FOUND };

  return { ok: true, style: rowToStyle(row) };
}

export async function archiveStyleForUser(userId: string, id: string): Promise<StyleActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, errors: NOT_FOUND };

  const [row] = await db
    .update(styles)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(styles.id, id), eq(styles.userId, userId), isNull(styles.archivedAt)))
    .returning({ id: styles.id });

  if (!row) return { ok: false, errors: NOT_FOUND };

  return { ok: true };
}

/**
 * Rewrites `sortOrder` from the given order. Ids the user does not own are
 * ignored; styles the caller left out keep their relative order after the rest.
 */
export async function reorderStylesForUser(userId: string, ids: unknown): Promise<StyleActionResult> {
  if (!Array.isArray(ids)) return { ok: false, errors: ["Nothing to reorder"] };

  const rows = await db
    .select({ id: styles.id })
    .from(styles)
    .where(and(eq(styles.userId, userId), isNull(styles.archivedAt)))
    .orderBy(asc(styles.sortOrder), asc(styles.createdAt));

  const owned = new Set(rows.map((row) => row.id));
  const ordered: string[] = [];
  for (const id of ids) {
    if (typeof id === "string" && owned.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const row of rows) if (!ordered.includes(row.id)) ordered.push(row.id);

  await db.transaction(async (tx) => {
    // One reorder at a time per user: two at once each updated the rows in
    // its own order and deadlocked (a 500 for the loser). With the lock the
    // second waits, then applies its order: last one wins.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`styles:${userId}`}))`);
    for (const [index, id] of ordered.entries()) {
      await tx
        .update(styles)
        .set({ sortOrder: index })
        .where(and(eq(styles.id, id), eq(styles.userId, userId)));
    }
  });

  return { ok: true };
}
