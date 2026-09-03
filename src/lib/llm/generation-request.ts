import {
  WEATHER_CONDITIONS,
  isOccasionId,
  type GenerationRequest,
  type WeatherCondition,
  type WeatherSnapshot,
} from "@/domain";

/**
 * Boundary validation for anything that came from the client before it reaches
 * the model. Pure, so it can be unit tested without a database.
 */

export const MIN_OUTFIT_COUNT = 1;
export const MAX_OUTFIT_COUNT = 5;
export const DEFAULT_OUTFIT_COUNT = 3;
export const MAX_STEER_LENGTH = 200;
/** Defensive cap so a hostile payload cannot blow up the prompt. */
export const MAX_ID_LIST_LENGTH = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MAX_ID_LIST_LENGTH) break;
  }
  return out;
}

export function validateWeatherSnapshot(
  input: unknown,
): { ok: true; weather: WeatherSnapshot } | { ok: false; errors: string[] } {
  if (!isRecord(input)) return { ok: false, errors: ["weather is required"] };
  const errors: string[] = [];

  const tempC = optionalNumber(input.tempC);
  if (tempC === undefined) errors.push("weather.tempC must be a number");
  else if (tempC < -60 || tempC > 60) errors.push("weather.tempC is out of range");

  const condition = input.condition;
  if (typeof condition !== "string" || !(WEATHER_CONDITIONS as readonly string[]).includes(condition)) {
    errors.push("weather.condition is not a known condition");
  }

  const source = input.source === "manual" || input.source === "forecast" ? input.source : undefined;
  if (!source) errors.push("weather.source must be \"forecast\" or \"manual\"");

  const precipitation = optionalNumber(input.precipitationChance);
  if (precipitation !== undefined && (precipitation < 0 || precipitation > 100)) {
    errors.push("weather.precipitationChance must be between 0 and 100");
  }

  if (errors.length) return { ok: false, errors };

  const place = typeof input.place === "string" && input.place.trim() ? input.place.trim().slice(0, 80) : undefined;

  return {
    ok: true,
    weather: {
      tempC: tempC as number,
      feelsLikeC: optionalNumber(input.feelsLikeC),
      lowC: optionalNumber(input.lowC),
      precipitationChance: precipitation,
      condition: condition as WeatherCondition,
      source: source as "forecast" | "manual",
      place,
    },
  };
}

export function validateGenerationRequest(
  input: unknown,
): { ok: true; request: GenerationRequest } | { ok: false; errors: string[] } {
  if (!isRecord(input)) return { ok: false, errors: ["A generation request is required"] };
  const errors: string[] = [];

  const occasion = input.occasion;
  if (typeof occasion !== "string" || !isOccasionId(occasion)) {
    errors.push("Pick an occasion");
  }

  const weather = validateWeatherSnapshot(input.weather);
  if (!weather.ok) errors.push(...weather.errors);

  if (input.styleId !== undefined && input.styleId !== null && !isUuid(input.styleId)) {
    errors.push("styleId is not a valid id");
  }

  if (input.steer !== undefined && input.steer !== null && typeof input.steer !== "string") {
    errors.push("steer must be text");
  }

  if (errors.length || !weather.ok || typeof occasion !== "string" || !isOccasionId(occasion)) {
    return { ok: false, errors };
  }

  const rawCount = optionalNumber(input.count);
  const count = rawCount === undefined ? DEFAULT_OUTFIT_COUNT : clamp(Math.round(rawCount), MIN_OUTFIT_COUNT, MAX_OUTFIT_COUNT);

  const steerRaw = typeof input.steer === "string" ? input.steer.trim() : "";
  const steer = steerRaw ? steerRaw.slice(0, MAX_STEER_LENGTH) : undefined;

  const pinned = idList(input.pinned);
  const excludedAll = idList(input.excluded);
  // A piece cannot be both demanded and forbidden; the pin wins.
  const excluded = excludedAll.filter((id) => !pinned.includes(id));

  return {
    ok: true,
    request: {
      styleId: isUuid(input.styleId) ? input.styleId : undefined,
      occasion,
      weather: weather.weather,
      steer,
      count,
      pinned,
      excluded,
    },
  };
}
