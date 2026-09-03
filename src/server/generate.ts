"use server";

import { revalidatePath } from "next/cache";
import type { Outfit } from "@/domain";
import { validateGenerationRequest } from "@/lib/llm/generation-request";
import { requireUser } from "@/lib/session";
import {
  generateOutfitsForUser,
  swapSlotForUser,
  type GenerateOutfitsResult,
  type SwapSlotInput,
} from "@/server/generate-core";

/** Server actions for the Today screen. Never throws at the client. */

export async function generateOutfits(input: unknown): Promise<GenerateOutfitsResult> {
  const currentUser = await requireUser();

  const parsed = validateGenerationRequest(input);
  if (!parsed.ok) {
    return {
      ok: false,
      code: "invalid",
      error: parsed.errors[0] ?? "That request is not something I can work with.",
    };
  }

  const result = await generateOutfitsForUser(currentUser.id, parsed.request);
  if (result.ok) revalidatePath("/today");
  return result;
}

export async function swapSlot(
  input: SwapSlotInput,
): Promise<{ ok: true; outfit: Outfit } | { ok: false; error: string }> {
  const currentUser = await requireUser();
  const result = await swapSlotForUser(currentUser.id, input);
  if (result.ok) revalidatePath("/today");
  return result;
}
