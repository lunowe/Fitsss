import { data } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { getLatestGenerationForUser } from "@/server/generations-queries";

/** GET /api/v1/generations/latest — the last set of outfits, or `null`. */
export const GET = withUser(async (_request, user) => {
  return data(await getLatestGenerationForUser(user.id));
});
