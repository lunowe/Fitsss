"use server";

import type { WeatherCondition, WeatherSnapshot } from "@/domain";

/**
 * Today's forecast from Open-Meteo (no key, no account) plus a best-effort
 * place name from Nominatim. Both calls are wrapped: a weather failure is a
 * readable error, a geocoding failure is silently ignored.
 */

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const REVERSE_GEOCODE_URL = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "Fitsss/0.1 (personal wardrobe app)";

const CACHE_TTL_MS = 30 * 60 * 1000;
const GEOCODE_TIMEOUT_MS = 2000;
const FORECAST_TIMEOUT_MS = 6000;

type CacheEntry = { at: number; weather: WeatherSnapshot };
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lon: number, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return `${lat.toFixed(2)},${lon.toFixed(2)}:${day}`;
}

/**
 * WMO weather interpretation codes, collapsed onto our six conditions.
 * 0–1 clear, 2–3 cloudy (45/48 fog reads as cloudy too), 51–67 and 80–82 rain,
 * 71–77 and 85–86 snow, 95+ thunderstorm. A gale over an otherwise calm sky
 * is reported as wind, because that is what you have to dress for.
 */
function conditionFromWeatherCode(code: number, windKmh: number): WeatherCondition {
  let base: WeatherCondition;
  if (!Number.isFinite(code)) base = "cloudy";
  else if (code >= 95) base = "storm";
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) base = "snow";
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) base = "rain";
  else if (code <= 1) base = "clear";
  else base = "cloudy";

  if (windKmh > 35 && (base === "clear" || base === "cloudy")) return "wind";
  return base;
}

function firstNumber(value: unknown): number | undefined {
  if (!Array.isArray(value)) return undefined;
  const n = value[0];
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

async function reverseGeocode(lat: number, lon: number): Promise<string | undefined> {
  try {
    const url = `${REVERSE_GEOCODE_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    const address = (body as { address?: Record<string, unknown> } | null)?.address;
    if (!address) return undefined;
    for (const key of ["city", "town", "village", "municipality", "county"]) {
      const value = address[key];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function getWeather(input: {
  lat: number;
  lon: number;
}): Promise<{ ok: true; weather: WeatherSnapshot } | { ok: false; error: string }> {
  const { lat, lon } = input ?? {};
  if (
    typeof lat !== "number" ||
    typeof lon !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return { ok: false, error: "Those coordinates do not look right." };
  }

  const now = new Date();
  const key = cacheKey(lat, lon, now);
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) {
    return { ok: true, weather: hit.weather };
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily:
      "temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,weather_code,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: "1",
  });

  let payload: unknown;
  try {
    const response = await fetch(`${FORECAST_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(FORECAST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, error: `The weather service answered with ${response.status}.` };
    }
    payload = await response.json();
  } catch {
    return { ok: false, error: "Could not reach the weather service. Set the weather by hand." };
  }

  const daily = (payload as { daily?: Record<string, unknown> } | null)?.daily;
  if (!daily) return { ok: false, error: "The weather service sent something unexpected." };

  const tempC = firstNumber(daily.temperature_2m_max);
  if (tempC === undefined) {
    return { ok: false, error: "The weather service sent no temperature for today." };
  }

  const feelsLikeC = firstNumber(daily.apparent_temperature_max);
  const lowC = firstNumber(daily.temperature_2m_min);
  const precipitationChance = firstNumber(daily.precipitation_probability_max);
  const code = firstNumber(daily.weather_code) ?? NaN;
  const windKmh = firstNumber(daily.wind_speed_10m_max) ?? 0;

  const place = await reverseGeocode(lat, lon);

  const weather: WeatherSnapshot = {
    tempC,
    feelsLikeC,
    lowC,
    precipitationChance:
      precipitationChance === undefined ? undefined : Math.max(0, Math.min(100, precipitationChance)),
    condition: conditionFromWeatherCode(code, windKmh),
    source: "forecast",
    place,
  };

  cache.set(key, { at: now.getTime(), weather });
  return { ok: true, weather };
}
