import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { generations } from "@/db/schema";
import type { GenerationRequest, GenerationResult, Outfit } from "@/domain";
import { isUuid } from "@/lib/llm/generation-request";
import { requireUser } from "@/lib/session";

type GenerationRow = typeof generations.$inferSelect;

export function rowToGenerationResult(row: GenerationRow): GenerationResult {
  return {
    id: row.id,
    request: row.request as GenerationRequest,
    outfits: (Array.isArray(row.outfits) ? row.outfits : []) as Outfit[],
    filteredOutCount: row.filteredOutCount,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The last set of outfits, so Today can come back to what it showed. A
 * restyle of a picture belongs to that picture, not to Today, so it is
 * skipped.
 */
export async function getLatestGeneration(): Promise<GenerationResult | null> {
  const currentUser = await requireUser();
  return getLatestGenerationForUser(currentUser.id);
}

export async function getLatestGenerationForUser(userId: string): Promise<GenerationResult | null> {
  const [row] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.userId, userId), sql`${generations.request}->>'inspoId' is null`))
    .orderBy(desc(generations.createdAt))
    .limit(1);

  return row ? rowToGenerationResult(row) : null;
}

export async function getGeneration(id: string): Promise<GenerationResult | null> {
  const currentUser = await requireUser();
  return getGenerationForUser(currentUser.id, id);
}

export async function getGenerationForUser(userId: string, id: string): Promise<GenerationResult | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.userId, userId)))
    .limit(1);

  return row ? rowToGenerationResult(row) : null;
}
