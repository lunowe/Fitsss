"use server";

import { revalidatePath } from "next/cache";
import type { Inspo, OccasionId, WeatherSnapshot } from "@/domain";
import { isOccasionId } from "@/domain";
import { requireUser } from "@/lib/session";
import { validateWeatherSnapshot } from "@/lib/llm/generation-request";
import { generateOutfitsForUser, type GenerateOutfitsResult } from "@/server/generate-core";
import {
  analyzeInspoForUser,
  createInspoFromImageForUser,
  createInspoFromUrlForUser,
  deleteInspoForUser,
  setInspoNoteForUser,
  setInspoStyleForUser,
  type InspoErrorCode,
} from "@/server/inspo-core";

/**
 * Write side of inspiration pictures. Every action resolves the session and
 * hands a user id to inspo-core; nothing here knows how a picture is read or
 * matched.
 */

export type InspoError = { ok: false; error: string; code: InspoErrorCode };
export type InspoActionResult = { ok: true; inspo: Inspo } | InspoError;

/** Default weather for a restyle when the caller has no forecast to hand. */
const FALLBACK_WEATHER: WeatherSnapshot = { tempC: 18, condition: "cloudy", source: "manual" };

function revalidate() {
  revalidatePath("/inspo");
  revalidatePath("/today");
}

/** Imports a picture from a link: a direct image, or a page that has one. */
export async function createInspoFromUrl(input: { url: string }): Promise<InspoActionResult> {
  const currentUser = await requireUser();
  const url = typeof input?.url === "string" ? input.url.trim() : "";
  if (!url) return { ok: false, code: "invalid", error: "Paste a link first." };

  const result = await createInspoFromUrlForUser(currentUser.id, url);
  if (result.ok) revalidate();
  return result;
}

/** Stores an upload. Field "image" is the file; "sourceUrl" is optional. */
export async function createInspoFromImage(formData: FormData): Promise<InspoActionResult> {
  const currentUser = await requireUser();

  const file = formData?.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, code: "invalid", error: "Pick a picture first." };
  }
  const sourceUrlValue = formData.get("sourceUrl");
  const sourceUrl = typeof sourceUrlValue === "string" ? sourceUrlValue : null;

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await createInspoFromImageForUser(currentUser.id, { bytes, sourceUrl });
  if (result.ok) revalidate();
  return result;
}

/** Re-runs the vision pass and the closet match. */
export async function analyzeInspo(id: string): Promise<InspoActionResult> {
  const currentUser = await requireUser();
  const result = await analyzeInspoForUser(currentUser.id, id);
  if (result.ok) revalidate();
  return result;
}

/** Generates outfits that restyle a saved picture out of the closet. */
export async function restyleFromInspo(input: {
  inspoId: string;
  count?: number;
  occasion?: OccasionId;
  weather?: WeatherSnapshot;
}): Promise<GenerateOutfitsResult> {
  const currentUser = await requireUser();
  const inspoId = typeof input?.inspoId === "string" ? input.inspoId.trim() : "";
  if (!inspoId) {
    return { ok: false, code: "invalid", error: "That picture is gone." };
  }

  const occasion: OccasionId =
    typeof input?.occasion === "string" && isOccasionId(input.occasion) ? input.occasion : "everyday";

  let weather = FALLBACK_WEATHER;
  if (input?.weather) {
    const checked = validateWeatherSnapshot(input.weather);
    if (!checked.ok) return { ok: false, code: "invalid", error: checked.errors[0] };
    weather = checked.weather;
  }

  const count = Math.min(5, Math.max(1, Math.round(Number(input?.count ?? 2)) || 2));

  return generateOutfitsForUser(currentUser.id, {
    occasion,
    weather,
    count,
    pinned: [],
    excluded: [],
    inspoId,
  });
}

/** Saves the picture as a reference for a style, or unfiles it with null. */
export async function setInspoStyle(input: {
  id: string;
  styleId: string | null;
}): Promise<InspoActionResult> {
  const currentUser = await requireUser();
  const result = await setInspoStyleForUser(currentUser.id, {
    id: input?.id,
    styleId: input?.styleId ?? null,
  });
  if (result.ok) {
    revalidate();
    revalidatePath("/styles");
  }
  return result;
}

export async function setInspoNote(input: { id: string; note: string }): Promise<InspoActionResult> {
  const currentUser = await requireUser();
  const result = await setInspoNoteForUser(currentUser.id, {
    id: input?.id,
    note: input?.note ?? "",
  });
  if (result.ok) revalidate();
  return result;
}

export async function deleteInspo(id: string): Promise<{ ok: boolean }> {
  const currentUser = await requireUser();
  const result = await deleteInspoForUser(currentUser.id, id);
  if (result.ok) revalidate();
  return result;
}
