"use server";

import { requireUser } from "@/lib/session";
import {
  archiveBlockForUser,
  createBlocksForUser,
  deleteBlockForUser,
  restoreBlockForUser,
  revalidateCloset,
  updateBlockForUser,
  type CreateBlocksResult,
  type UpdateBlockResult,
} from "@/server/blocks-core";

/**
 * The closet's writes as server actions. All the work lives in
 * `blocks-core.ts`, which the REST handlers under `/api/v1` share; these
 * wrappers add the session and the cache invalidation the web app needs.
 */

export async function createBlocks(inputs: unknown[]): Promise<CreateBlocksResult> {
  const currentUser = await requireUser();
  // Without an idempotency key the outcome is always a result.
  const outcome = await createBlocksForUser(currentUser.id, inputs);
  const result = outcome.ok ? outcome.result : { created: [], failed: [] };
  if (result.created.length > 0) revalidateCloset();
  return result;
}

export async function updateBlock(id: string, input: unknown): Promise<UpdateBlockResult> {
  const currentUser = await requireUser();
  const result = await updateBlockForUser(currentUser.id, id, input);
  if (result.ok) revalidateCloset();
  return result;
}

export async function archiveBlock(id: string): Promise<{ ok: boolean }> {
  const currentUser = await requireUser();
  const result = await archiveBlockForUser(currentUser.id, id);
  if (result.ok) revalidateCloset();
  return result;
}

export async function restoreBlock(id: string): Promise<{ ok: boolean }> {
  const currentUser = await requireUser();
  const result = await restoreBlockForUser(currentUser.id, id);
  if (result.ok) revalidateCloset();
  return result;
}

export async function deleteBlock(id: string): Promise<{ ok: boolean }> {
  const currentUser = await requireUser();
  const result = await deleteBlockForUser(currentUser.id, id);
  if (result.ok) revalidateCloset();
  return result;
}
