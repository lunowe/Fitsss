import "server-only";

import type { TasteProfile } from "@/lib/taste";
import { requireUser } from "@/lib/session";
import { getTasteOverviewForUser, getTasteProfileForUser } from "@/server/taste-core";

/**
 * Read side of taste memory. Server components call these directly; every
 * query is scoped to the signed-in user.
 */

/** The profile for one style, or the overall one when `styleId` is null. */
export async function getTasteProfile(styleId: string | null): Promise<TasteProfile> {
  const currentUser = await requireUser();
  return getTasteProfileForUser(currentUser.id, styleId);
}

/** Everything the "you" screen needs: the overall profile plus one per style. */
export async function getTasteOverview(): Promise<{
  overall: TasteProfile;
  byStyle: Record<string, TasteProfile>;
  totalEvents: number;
}> {
  const currentUser = await requireUser();
  return getTasteOverviewForUser(currentUser.id);
}
