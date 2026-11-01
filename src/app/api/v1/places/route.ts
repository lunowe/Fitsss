import { data, failure, invalid } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { searchPlaces } from "@/server/places";

/**
 * GET /api/v1/places?q=… — up to eight `TripPlace`s matching a name, each with
 * its time zone. Fewer than two characters answers an empty list. Behind
 * sign-in so the server is not an open geocoding proxy.
 */
export const GET = withUser(async (request) => {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchPlaces(q);
  if (result.ok) return data(result.places);
  return result.code === "invalid" ? invalid([result.error]) : failure(503, "search_failed", result.error);
});
