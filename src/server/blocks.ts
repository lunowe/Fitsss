"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { blocks } from "@/db/schema";
import { derive, type Block, type BlockInput, validateBlockInput } from "@/domain";
import { requireUser } from "@/lib/session";
import { rowToBlock } from "@/server/blocks-queries";

type CreateBlocksResult = {
  created: Block[];
  failed: { index: number; errors: string[] }[];
};

type UpdateBlockResult =
  | { ok: true; block: Block }
  | { ok: false; errors: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toInsertValues(input: BlockInput, userId: string) {
  const derived = derive(input);
  return {
    userId,
    typeId: input.typeId,
    category: derived.category,
    color: input.color,
    secondaryColor: input.secondaryColor,
    fit: input.fit,
    variant: input.variant,
    material: input.material,
    pattern: input.pattern,
    weight: input.weight,
    effectiveWeight: derived.effectiveWeight,
    quantity: input.quantity,
    nickname: input.nickname,
    notes: input.notes,
    warmth: derived.warmth,
    formality: derived.formality,
    seasons: derived.seasons,
    label: derived.label,
  };
}

export async function createBlocks(inputs: unknown[]): Promise<CreateBlocksResult> {
  const currentUser = await requireUser();
  const failed: CreateBlocksResult["failed"] = [];
  const valid: BlockInput[] = [];

  inputs.forEach((input, index) => {
    const result = validateBlockInput(input);
    if (result.ok) valid.push(result.value);
    else failed.push({ index, errors: result.errors });
  });

  if (valid.length === 0) {
    return { created: [], failed };
  }

  const rows = await db.transaction((tx) =>
    tx
      .insert(blocks)
      .values(valid.map((input) => toInsertValues(input, currentUser.id)))
      .returning(),
  );

  revalidatePath("/closet");
  return { created: rows.map(rowToBlock), failed };
}

export async function updateBlock(id: string, input: unknown): Promise<UpdateBlockResult> {
  const currentUser = await requireUser();
  const result = validateBlockInput(input);

  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }

  if (!UUID_RE.test(id)) {
    return { ok: false, errors: ["Block not found"] };
  }

  const [row] = await db
    .update(blocks)
    .set({
      ...toInsertValues(result.value, currentUser.id),
      updatedAt: new Date(),
    })
    .where(and(eq(blocks.id, id), eq(blocks.userId, currentUser.id)))
    .returning();

  if (!row) {
    return { ok: false, errors: ["Block not found"] };
  }

  revalidatePath("/closet");
  return { ok: true, block: rowToBlock(row) };
}

export async function archiveBlock(id: string): Promise<{ ok: boolean }> {
  const currentUser = await requireUser();
  if (!UUID_RE.test(id)) return { ok: false };
  const [row] = await db
    .update(blocks)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(blocks.id, id), eq(blocks.userId, currentUser.id)))
    .returning({ id: blocks.id });

  if (row) revalidatePath("/closet");
  return { ok: Boolean(row) };
}

export async function restoreBlock(id: string): Promise<{ ok: boolean }> {
  const currentUser = await requireUser();
  if (!UUID_RE.test(id)) return { ok: false };
  const [row] = await db
    .update(blocks)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(blocks.id, id), eq(blocks.userId, currentUser.id)))
    .returning({ id: blocks.id });

  if (row) revalidatePath("/closet");
  return { ok: Boolean(row) };
}

export async function deleteBlock(id: string): Promise<{ ok: boolean }> {
  const currentUser = await requireUser();
  if (!UUID_RE.test(id)) return { ok: false };
  const [row] = await db
    .delete(blocks)
    .where(and(eq(blocks.id, id), eq(blocks.userId, currentUser.id)))
    .returning({ id: blocks.id });

  if (row) revalidatePath("/closet");
  return { ok: Boolean(row) };
}
