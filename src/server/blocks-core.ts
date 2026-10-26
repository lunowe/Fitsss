import "server-only";

import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { apiIdempotency, blocks } from "@/db/schema";
import {
  applyCatalogExtension,
  derive,
  type Block,
  type BlockInput,
  validateBlockInput,
} from "@/domain";
import { isUuid } from "@/lib/llm/generation-request";
import { rowToBlock } from "@/server/blocks-queries";
import { loadCatalogExtension } from "@/server/catalog-queries";

/**
 * The closet's writes, taking the user explicitly.
 *
 * Split out of `blocks.ts` so that both transports can share them: the server
 * actions the web app calls, and the REST handlers under `/api/v1` that the
 * native app calls. Everything session-shaped — `requireUser`,
 * `revalidatePath` — belongs to the caller, not here.
 */

export type CreateBlocksResult = {
  created: Block[];
  failed: { index: number; errors: string[] }[];
};

export type CreateBlocksOutcome =
  | { ok: true; result: CreateBlocksResult; replayed: boolean }
  | { ok: false; reason: "key-reused" | "too-many" | "unreadable" };

/**
 * The request hash a key gets when a client abandons it (see
 * `abandonSaveForUser`): no real request hashes to this, so a late send
 * with the key is refused instead of stored.
 */
const ABANDONED = "abandoned";

/** The most pieces one save may hold: far above any real cart, well below Postgres's parameter limit. */
export const MAX_BATCH = 500;

export type UpdateBlockResult =
  | { ok: true; block: Block }
  | { ok: false; errors: string[] };

/** The screens that show closet contents, invalidated after any write. */
export function revalidateCloset() {
  revalidatePath("/closet");
}

/**
 * Column values for an input. Every nullable attribute is written explicitly,
 * `null` when absent: an update replaces the whole piece, and Drizzle leaves
 * columns set to `undefined` untouched, which would keep a cleared nickname
 * or material while the derived label and warmth assume it is gone.
 */
function toColumnValues(input: BlockInput, userId: string) {
  const derived = derive(input);
  return {
    userId,
    typeId: input.typeId,
    category: derived.category,
    color: input.color,
    secondaryColor: input.secondaryColor ?? null,
    fit: input.fit ?? null,
    variant: input.variant ?? null,
    material: input.material ?? null,
    pattern: input.pattern,
    weight: input.weight ?? null,
    effectiveWeight: derived.effectiveWeight,
    quantity: input.quantity,
    nickname: input.nickname ?? null,
    notes: input.notes ?? null,
    warmth: derived.warmth,
    formality: derived.formality,
    seasons: derived.seasons,
    label: derived.label,
  };
}

/**
 * Validates and derives against the user's catalog.
 *
 * The catalog registry is process-global (see `applyCatalogExtension`), so
 * the extension is applied and used in one synchronous stretch: no other
 * request can swap in its own catalog between the two.
 */
async function prepare(userId: string, inputs: unknown[]) {
  const extension = await loadCatalogExtension(userId);
  applyCatalogExtension(extension);

  const failed: CreateBlocksResult["failed"] = [];
  const values: ReturnType<typeof toColumnValues>[] = [];
  inputs.forEach((input, index) => {
    const result = validateBlockInput(input);
    if (result.ok) values.push(toColumnValues(result.value, userId));
    else failed.push({ index, errors: result.errors });
  });
  return { values, failed };
}

/**
 * JSON with object keys sorted at every level, so "the same request" means the
 * same values, whatever order a client's encoder writes the keys in.
 */
function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 16) throw new RangeError("nested too deep");
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    // `null` and a missing key mean the same to validation, so they hash the same.
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v, depth + 1)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** What a save with this key stored, or null when no save with it was committed (yet). */
export async function findSaveForUser(userId: string, key: string): Promise<CreateBlocksResult | null> {
  const row = await findSaveRow(userId, key);
  return (row?.response as CreateBlocksResult | undefined) ?? null;
}

/**
 * Settles a save whose answer a client never got, for good: either what it
 * stored, or null and a promise that it never will.
 *
 * A plain lookup is not enough: a 404 only means "not committed yet", and a
 * request still on its way (a slow network, a proxy holding it) would store
 * after the client had put the pieces back. So the key is claimed here: an
 * abandoned marker is inserted, and any later send with the key is refused.
 * A first send still running holds the key in its transaction; the insert
 * waits for it and then sees what it committed.
 */
export async function abandonSaveForUser(userId: string, key: string): Promise<CreateBlocksResult | null> {
  const claimed = await db
    .insert(apiIdempotency)
    .values({ userId, key, requestHash: ABANDONED })
    .onConflictDoNothing()
    .returning({ key: apiIdempotency.key });
  if (claimed.length) return null;

  const row = await findSaveRow(userId, key);
  return (row?.response as CreateBlocksResult | undefined) ?? null;
}

async function findSaveRow(userId: string, key: string) {
  const [row] = await db
    .select()
    .from(apiIdempotency)
    .where(and(eq(apiIdempotency.userId, userId), eq(apiIdempotency.key, key)))
    .limit(1);
  return row;
}

/**
 * Saves a batch. With an idempotency key, a repeat of the same request returns
 * the first answer instead of saving again.
 *
 * The key is looked up before anything else, validation included: whether a
 * repeat replays must not depend on whether the input would still validate
 * (the catalog may have changed in between). It is then claimed in the same
 * transaction as the insert, so two concurrent first sends serialize on it
 * and the second replays what the first stored.
 */
export async function createBlocksForUser(
  userId: string,
  inputs: unknown[],
  options: { idempotencyKey?: string } = {},
): Promise<CreateBlocksOutcome> {
  const key = options.idempotencyKey;
  let requestHash: string;
  try {
    requestHash = createHash("sha256").update(canonicalJson(inputs)).digest("hex");
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  if (key) {
    const previous = await findSaveRow(userId, key);
    if (previous) {
      if (previous.requestHash !== requestHash) return { ok: false, reason: "key-reused" };
      return { ok: true, result: previous.response as CreateBlocksResult, replayed: true };
    }
  }

  if (inputs.length > MAX_BATCH) return { ok: false, reason: "too-many" };

  const { values, failed } = await prepare(userId, inputs);

  if (values.length === 0) {
    // Nothing would be stored, so there is nothing to make idempotent.
    return { ok: true, result: { created: [], failed }, replayed: false };
  }

  return db.transaction(async (tx): Promise<CreateBlocksOutcome> => {
    if (key) {
      const claimed = await tx
        .insert(apiIdempotency)
        .values({ userId, key, requestHash })
        .onConflictDoNothing()
        .returning({ key: apiIdempotency.key });

      if (claimed.length === 0) {
        // A concurrent first send committed while this one waited on the key.
        const [previous] = await tx
          .select()
          .from(apiIdempotency)
          .where(and(eq(apiIdempotency.userId, userId), eq(apiIdempotency.key, key)))
          .limit(1);
        if (!previous || previous.requestHash !== requestHash) return { ok: false, reason: "key-reused" };
        return { ok: true, result: previous.response as CreateBlocksResult, replayed: true };
      }
    }

    const rows = await tx.insert(blocks).values(values).returning();
    const result: CreateBlocksResult = { created: rows.map(rowToBlock), failed };

    if (key) {
      await tx
        .update(apiIdempotency)
        .set({ response: JSON.parse(JSON.stringify(result)) })
        .where(and(eq(apiIdempotency.userId, userId), eq(apiIdempotency.key, key)));
    }
    return { ok: true, result, replayed: false };
  });
}

export async function updateBlockForUser(
  userId: string,
  id: string,
  input: unknown,
): Promise<UpdateBlockResult> {
  const { values, failed } = await prepare(userId, [input]);

  if (failed.length) {
    return { ok: false, errors: failed[0].errors };
  }

  if (!isUuid(id)) {
    return { ok: false, errors: ["Block not found"] };
  }

  const [row] = await db
    .update(blocks)
    .set({ ...values[0], updatedAt: new Date() })
    .where(and(eq(blocks.id, id), eq(blocks.userId, userId)))
    .returning();

  if (!row) {
    return { ok: false, errors: ["Block not found"] };
  }

  return { ok: true, block: rowToBlock(row) };
}

export async function archiveBlockForUser(userId: string, id: string): Promise<{ ok: boolean }> {
  if (!isUuid(id)) return { ok: false };
  const [row] = await db
    .update(blocks)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(blocks.id, id), eq(blocks.userId, userId)))
    .returning({ id: blocks.id });

  return { ok: Boolean(row) };
}

export async function restoreBlockForUser(userId: string, id: string): Promise<{ ok: boolean }> {
  if (!isUuid(id)) return { ok: false };
  const [row] = await db
    .update(blocks)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(blocks.id, id), eq(blocks.userId, userId)))
    .returning({ id: blocks.id });

  return { ok: Boolean(row) };
}

export async function deleteBlockForUser(userId: string, id: string): Promise<{ ok: boolean }> {
  if (!isUuid(id)) return { ok: false };
  const [row] = await db
    .delete(blocks)
    .where(and(eq(blocks.id, id), eq(blocks.userId, userId)))
    .returning({ id: blocks.id });

  return { ok: Boolean(row) };
}
