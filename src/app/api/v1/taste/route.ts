import { data } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { getTasteOverviewForUser } from "@/server/taste-core";

/**
 * GET /api/v1/taste — `{ overall, byStyle: { [styleId]: TasteProfile },
 * totalEvents }`: what Fitsss has learned, overall and per active style.
 */
export const GET = withUser(async (_request, user) => {
  return data(await getTasteOverviewForUser(user.id));
});
