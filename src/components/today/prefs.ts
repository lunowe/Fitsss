/**
 * The two things Today remembers between visits: the last weather snapshot (so
 * the screen fills in before geolocation answers) and the steering the user
 * last picked.
 *
 * Both are read through `useSyncExternalStore` rather than an effect that sets
 * state: localStorage can only be read on the client, and an external store is
 * how React wants that read expressed. Every parse is defensive, because the
 * value can be stale, hand-edited, or from an older build.
 */

import {
  WEATHER_CONDITIONS,
  isOccasionId,
  type OccasionId,
  type WeatherCondition,
  type WeatherSnapshot,
} from "@/domain";

const WEATHER_KEY = "fitsss-weather";
const PREFS_KEY = "fitsss-today-prefs";

/** A cached forecast older than this is refetched. */
export const WEATHER_MAX_AGE_MS = 60 * 60 * 1000;

export interface TodayPrefs {
  /** null means "Any style". */
  styleId: string | null;
  occasion: OccasionId;
}

export const DEFAULT_PREFS: TodayPrefs = { styleId: null, occasion: "everyday" };

/* ------------------------------------------------------------------ */
/* localStorage                                                        */
/* ------------------------------------------------------------------ */

function parse(key: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or a full quota: the screen still works, it just forgets.
  }
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readCachedWeather(now: number): WeatherSnapshot | null {
  const stored = parse(WEATHER_KEY);
  if (!stored) return null;

  const at = num(stored.at);
  const weather =
    typeof stored.weather === "object" && stored.weather !== null
      ? (stored.weather as Record<string, unknown>)
      : null;
  if (at === undefined || !weather) return null;

  const tempC = num(weather.tempC);
  const condition = weather.condition;
  if (tempC === undefined || typeof condition !== "string") return null;
  if (!(WEATHER_CONDITIONS as readonly string[]).includes(condition)) return null;

  const source = weather.source === "manual" ? "manual" : "forecast";
  // A hand-set snapshot holds until the user changes it; a forecast goes stale.
  if (source === "forecast" && now - at > WEATHER_MAX_AGE_MS) return null;

  return {
    tempC,
    feelsLikeC: num(weather.feelsLikeC),
    lowC: num(weather.lowC),
    precipitationChance: num(weather.precipitationChance),
    condition: condition as WeatherCondition,
    source,
    place: typeof weather.place === "string" && weather.place.trim() ? weather.place : undefined,
  };
}

function readStoredPrefs(): TodayPrefs | null {
  const stored = parse(PREFS_KEY);
  if (!stored) return null;
  const occasion =
    typeof stored.occasion === "string" && isOccasionId(stored.occasion)
      ? stored.occasion
      : DEFAULT_PREFS.occasion;
  const styleId = typeof stored.styleId === "string" && stored.styleId ? stored.styleId : null;
  return { styleId, occasion };
}

/* ------------------------------------------------------------------ */
/* Weather store                                                       */
/* ------------------------------------------------------------------ */

let weather: WeatherSnapshot | null = null;
let weatherHydrated = false;
const weatherListeners = new Set<() => void>();

function hydrateWeather() {
  if (weatherHydrated) return;
  weatherHydrated = true;
  weather = readCachedWeather(Date.now());
}

export function subscribeWeather(onStoreChange: () => void): () => void {
  hydrateWeather();
  weatherListeners.add(onStoreChange);
  return () => {
    weatherListeners.delete(onStoreChange);
  };
}

export function getWeatherSnapshot(): WeatherSnapshot | null {
  hydrateWeather();
  return weather;
}

export function getServerWeatherSnapshot(): WeatherSnapshot | null {
  return null;
}

/** Records a new snapshot, caches it with a timestamp, and wakes the screen. */
export function setCachedWeather(next: WeatherSnapshot) {
  weather = next;
  weatherHydrated = true;
  write(WEATHER_KEY, { at: Date.now(), weather: next });
  for (const listener of weatherListeners) listener();
}

/* ------------------------------------------------------------------ */
/* Steering store                                                      */
/* ------------------------------------------------------------------ */

let prefs: TodayPrefs | null = null;
let prefsHydrated = false;
const prefsListeners = new Set<() => void>();

function hydratePrefs() {
  if (prefsHydrated) return;
  prefsHydrated = true;
  prefs = readStoredPrefs();
}

export function subscribePrefs(onStoreChange: () => void): () => void {
  hydratePrefs();
  prefsListeners.add(onStoreChange);
  return () => {
    prefsListeners.delete(onStoreChange);
  };
}

/** null when the user has never picked anything on this device. */
export function getPrefs(): TodayPrefs | null {
  hydratePrefs();
  return prefs;
}

export function getServerPrefs(): TodayPrefs | null {
  return null;
}

export function setPrefs(next: TodayPrefs) {
  prefs = next;
  prefsHydrated = true;
  write(PREFS_KEY, next);
  for (const listener of prefsListeners) listener();
}
