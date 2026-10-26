"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { recordOutfitEventForUser, type RecordOutfitEventInput } from "@/server/feedback-core";

/**
 * Outfit feedback as a server action. The work lives in `feedback-core.ts`,
 * which `POST /api/v1/outfit-events` shares.
 */
export async function recordOutfitEvent(input: RecordOutfitEventInput): Promise<{ ok: boolean }> {
  const currentUser = await requireUser();
  const result = await recordOutfitEventForUser(currentUser.id, input);
  if (result.ok) revalidatePath("/today");
  return result;
}
