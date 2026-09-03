import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { blocks } from "@/db/schema";
import {
  CATEGORIES,
  type Block,
  type Category,
  type MaterialId,
  type Pattern,
  type Season,
  type Weight,
} from "@/domain";
import { requireUser } from "@/lib/session";

type BlockRow = typeof blocks.$inferSelect;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function rowToBlock(row: BlockRow): Block {
  return {
    id: row.id,
    userId: row.userId,
    typeId: row.typeId,
    category: row.category as Category,
    color: row.color,
    secondaryColor: row.secondaryColor ?? undefined,
    fit: row.fit ?? undefined,
    variant: row.variant ?? undefined,
    material: (row.material as MaterialId | null) ?? undefined,
    pattern: row.pattern as Pattern,
    weight: (row.weight as Weight | null) ?? undefined,
    effectiveWeight: row.effectiveWeight as Weight,
    quantity: row.quantity,
    nickname: row.nickname ?? undefined,
    notes: row.notes ?? undefined,
    warmth: row.warmth,
    formality: row.formality,
    seasons: row.seasons as Season[],
    label: row.label,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export async function listBlocks({
  includeArchived = false,
}: {
  includeArchived?: boolean;
} = {}): Promise<Block[]> {
  const currentUser = await requireUser();
  const where = includeArchived
    ? eq(blocks.userId, currentUser.id)
    : and(eq(blocks.userId, currentUser.id), isNull(blocks.archivedAt));

  const rows = await db
    .select()
    .from(blocks)
    .where(where)
    .orderBy(asc(blocks.category), desc(blocks.createdAt));

  return rows.map(rowToBlock);
}

export async function getBlock(id: string): Promise<Block | null> {
  const currentUser = await requireUser();
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.id, id), eq(blocks.userId, currentUser.id)))
    .limit(1);

  return row ? rowToBlock(row) : null;
}

export async function closetSummary(): Promise<{
  total: number;
  byCategory: Record<Category, number>;
}> {
  const allBlocks = await listBlocks();
  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<
    Category,
    number
  >;

  let total = 0;
  for (const block of allBlocks) {
    total += block.quantity;
    byCategory[block.category] += block.quantity;
  }

  return { total, byCategory };
}
