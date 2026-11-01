import "server-only";

import type { TripDayWeather, TripPlace } from "@/domain";
import {
  DAILY_ARCHIVE_FIELDS,
  DAILY_FORECAST_FIELDS,
  TYPICAL_YEARS,
  archiveWindow,
  forecastDays,
  typicalDays,
  type DailySeries,
} from "@/lib/trip/weather";

/**
 * Weather for every day of a trip, from Open-Meteo (no key): the forecast for
 * the days it reaches (about two weeks), typical weather from recent years for
 * the rest. Fails only when neither answers.
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60 * 60 * 1000;

const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, { at: number; days: TripDayWeather[] }>();

async function fetchDaily(url: string): Promise<DailySeries | undefined> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { daily?: DailySeries } | null;
    return body?.daily;
  } catch {
    return undefined;
  }
}

function coordinates(place: TripPlace): Record<string, string> {
  return { latitude: place.lat.toFixed(4), longitude: place.lon.toFixed(4), timezone: place.timezone };
}

export async function tripWeather(
  place: TripPlace,
  dates: string[],
): Promise<{ ok: true; days: TripDayWeather[] } | { ok: false; error: string }> {
  if (dates.length === 0) return { ok: true, days: [] };
  // The same precision and zone as the request upstream: days are read in that zone.
  const key = `${place.lat.toFixed(4)},${place.lon.toFixed(4)},${place.timezone}:${dates[0]}:${dates.at(-1)}:${new Date().toISOString().slice(0, 13)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ok: true, days: hit.days };

  const forecastParams = new URLSearchParams({ ...coordinates(place), daily: DAILY_FORECAST_FIELDS, forecast_days: "16" });
  const forecast = forecastDays(await fetchDaily(`${FORECAST_URL}?${forecastParams}`), dates);

  const missing = dates.filter((date) => !forecast.has(date));
  let typical = new Map<string, TripDayWeather>();
  if (missing.length) {
    const archives = await Promise.all(
      Array.from({ length: TYPICAL_YEARS }, (_, k) => {
        const window = archiveWindow(missing[0], missing.at(-1)!, k + 1);
        const params = new URLSearchParams({
          ...coordinates(place),
          daily: DAILY_ARCHIVE_FIELDS,
          start_date: window.start,
          end_date: window.end,
        });
        return fetchDaily(`${ARCHIVE_URL}?${params}`);
      }),
    );
    typical = typicalDays(archives, missing);
  }

  const days = dates
    .map((date) => forecast.get(date) ?? typical.get(date))
    .filter((day): day is TripDayWeather => Boolean(day));
  if (days.length < dates.length) {
    return { ok: false, error: "Could not get the weather for those dates. Try again in a moment." };
  }

  // Per process and short-lived; a crude cap keeps it from growing for ever.
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(key, { at: Date.now(), days });
  return { ok: true, days };
}
