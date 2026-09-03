import "server-only";

import { and, desc, eq } from "drizzle-orm";
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

/** The last set of outfits, so Today can come back to what it showed. */
export async function getLatestGeneration(): Promise<GenerationResult | null> {
  const currentUser = await requireUser();
  const [row] = await db
    .select()
    .from(generations)
    .where(eq(generations.userId, currentUser.id))
    .orderBy(desc(generations.createdAt))
    .limit(1);

  return row ? rowToGenerationResult(row) : null;
}

export async function getGeneration(id: string): Promise<GenerationResult | null> {
  const currentUser = await requireUser();
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.userId, currentUser.id)))
    .limit(1);

  return row ? rowToGenerationResult(row) : null;
}
