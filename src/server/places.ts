import "server-only";

import { cleanText, type TripPlace } from "@/domain";
import { validateTripPlace } from "@/domain";

/**
 * Place search for trips: Open-Meteo's geocoder (no key, the same service as
 * the weather). Answers places with their time zone, which is what the trip's
 * dates and forecast are read in.
 */

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS = 8;
export const PLACE_QUERY_LENGTHS = { min: 2, max: 80 } as const;

const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, { at: number; places: TripPlace[] }>();

interface RawPlace {
  name?: unknown;
  admin1?: unknown;
  country?: unknown;
  country_code?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  timezone?: unknown;
}

export async function searchPlaces(
  query: string,
): Promise<{ ok: true; places: TripPlace[] } | { ok: false; code: "invalid" | "unavailable"; error: string }> {
  const q = cleanText(query).replace(/\s+/g, " ").trim();
  const length = [...q].length;
  if (length < PLACE_QUERY_LENGTHS.min) return { ok: true, places: [] };
  if (length > PLACE_QUERY_LENGTHS.max) return { ok: false, code: "invalid", error: "That is too long for a place name." };

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ok: true, places: hit.places };

  const params = new URLSearchParams({ name: q, count: String(MAX_RESULTS), language: "en", format: "json" });
  let results: RawPlace[];
  try {
    const response = await fetch(`${GEOCODE_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return { ok: false, code: "unavailable", error: "The place search is not answering. Try again in a moment." };
    const body = (await response.json()) as { results?: RawPlace[] } | null;
    results = Array.isArray(body?.results) ? body.results : [];
  } catch {
    return { ok: false, code: "unavailable", error: "Could not reach the place search. Check the connection and try again." };
  }

  const places: TripPlace[] = [];
  for (const raw of results) {
    const checked = validateTripPlace({
      name: raw.name,
      region: raw.admin1,
      country: raw.country,
      countryCode: raw.country_code,
      lat: raw.latitude,
      lon: raw.longitude,
      timezone: raw.timezone,
    });
    if (checked.ok) places.push(checked.value);
  }

  // Per process and short-lived; a crude cap keeps it from growing for ever.
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, { at: Date.now(), places });
  return { ok: true, places };
}
