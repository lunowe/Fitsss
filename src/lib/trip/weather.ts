import { addDays, type TripDayWeather, type WeatherCondition } from "@/domain";
import { conditionFromWeatherCode } from "@/lib/weather/codes";

/**
 * Turning Open-Meteo's daily arrays into one weather line per trip day. Pure,
 * so the averaging can be tested without the network.
 *
 * Near dates come from the forecast. Further out there is no forecast, so a
 * day gets what is typical: the same calendar days in recent years, two days
 * either side, averaged. Labelled "typical" all the way to the screen.
 */

/** Open-Meteo's `daily` block, as much of it as is read here. */
export interface DailySeries {
  time?: unknown;
  temperature_2m_max?: unknown;
  temperature_2m_min?: unknown;
  apparent_temperature_max?: unknown;
  precipitation_probability_max?: unknown;
  precipitation_sum?: unknown;
  weather_code?: unknown;
  wind_speed_10m_max?: unknown;
}

export const DAILY_FORECAST_FIELDS =
  "temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,weather_code,wind_speed_10m_max";

export const DAILY_ARCHIVE_FIELDS =
  "temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,weather_code,wind_speed_10m_max";

/** Past years averaged for a typical day. */
export const TYPICAL_YEARS = 4;
/** Days either side of the date that count towards its typical weather. */
export const TYPICAL_SPREAD = 2;
/** A day counts as wet from this much rain, in mm. */
const WET_DAY_MM = 1;

function numberAt(series: unknown, i: number): number | undefined {
  if (!Array.isArray(series)) return undefined;
  const n = series[i];
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** The forecast's days that fall on the trip, by date. */
export function forecastDays(daily: DailySeries | undefined, dates: string[]): Map<string, TripDayWeather> {
  const out = new Map<string, TripDayWeather>();
  if (!daily || !Array.isArray(daily.time)) return out;
  const wanted = new Set(dates);
  daily.time.forEach((date, i) => {
    if (typeof date !== "string" || !wanted.has(date)) return;
    const tempC = numberAt(daily.temperature_2m_max, i);
    if (tempC === undefined) return;
    const chance = numberAt(daily.precipitation_probability_max, i);
    out.set(date, {
      date,
      tempC: round1(tempC),
      lowC: optionalRound(numberAt(daily.temperature_2m_min, i)),
      feelsLikeC: optionalRound(numberAt(daily.apparent_temperature_max, i)),
      precipitationChance: chance === undefined ? undefined : Math.max(0, Math.min(100, Math.round(chance))),
      condition: conditionFromWeatherCode(numberAt(daily.weather_code, i) ?? Number.NaN, numberAt(daily.wind_speed_10m_max, i) ?? 0),
      source: "forecast",
    });
  });
  return out;
}

function optionalRound(n: number | undefined): number | undefined {
  return n === undefined ? undefined : round1(n);
}

/** The same calendar day `years` back. 29 February falls on the 28th. */
export function sameDayYearsBack(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const year = y - years;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The archive window to fetch for one past year: the trip's dates, widened by the spread. */
export function archiveWindow(startDate: string, endDate: string, years: number): { start: string; end: string } {
  return {
    start: addDays(sameDayYearsBack(startDate, years), -TYPICAL_SPREAD),
    end: addDays(sameDayYearsBack(endDate, years), TYPICAL_SPREAD),
  };
}

interface Sample {
  max: number;
  min?: number;
  feels?: number;
  /** Unknown when the archive has no rain total and the sky says nothing either way. */
  wet?: boolean;
  condition: WeatherCondition;
}

/**
 * Typical weather for each date from archive years (`archives[k]` is the year
 * `k + 1` back, fetched with `archiveWindow`). Dates with no sample at all are
 * left out.
 */
export function typicalDays(archives: (DailySeries | undefined)[], dates: string[]): Map<string, TripDayWeather> {
  const samplesByArchiveDate = archives.map((daily) => {
    const byDate = new Map<string, Sample>();
    if (!daily || !Array.isArray(daily.time)) return byDate;
    daily.time.forEach((date, i) => {
      if (typeof date !== "string") return;
      const max = numberAt(daily.temperature_2m_max, i);
      if (max === undefined) return;
      const condition = conditionFromWeatherCode(numberAt(daily.weather_code, i) ?? Number.NaN, numberAt(daily.wind_speed_10m_max, i) ?? 0);
      const rain = numberAt(daily.precipitation_sum, i);
      // No total is not a dry day: fall back to what the sky code says, when it says rain or snow.
      const wet = rain !== undefined ? rain >= WET_DAY_MM : condition === "rain" || condition === "snow" || condition === "storm" ? true : undefined;
      byDate.set(date, {
        max,
        min: numberAt(daily.temperature_2m_min, i),
        feels: numberAt(daily.apparent_temperature_max, i),
        wet,
        condition,
      });
    });
    return byDate;
  });

  const out = new Map<string, TripDayWeather>();
  for (const date of dates) {
    const samples: Sample[] = [];
    samplesByArchiveDate.forEach((byDate, k) => {
      const centre = sameDayYearsBack(date, k + 1);
      for (let offset = -TYPICAL_SPREAD; offset <= TYPICAL_SPREAD; offset++) {
        const sample = byDate.get(addDays(centre, offset));
        if (sample) samples.push(sample);
      }
    });
    if (samples.length === 0) continue;

    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const mins = samples.map((s) => s.min).filter((n): n is number => n !== undefined);
    const feels = samples.map((s) => s.feels).filter((n): n is number => n !== undefined);
    const known = samples.filter((s) => s.wet !== undefined);
    const wetShare = known.length ? known.filter((s) => s.wet).length / known.length : 0;
    out.set(date, {
      date,
      tempC: round1(mean(samples.map((s) => s.max))),
      lowC: mins.length ? round1(mean(mins)) : undefined,
      feelsLikeC: feels.length ? round1(mean(feels)) : undefined,
      precipitationChance: known.length ? Math.round(wetShare * 100) : undefined,
      condition: typicalCondition(samples, wetShare),
      source: "typical",
    });
  }
  return out;
}

/**
 * What to dress for on a typical day: snow when it mostly snowed, rain when
 * more often wet than not, else the commonest of clear, cloudy and windy.
 */
function typicalCondition(samples: Sample[], wetShare: number): WeatherCondition {
  const snowShare = samples.filter((s) => s.condition === "snow").length / samples.length;
  if (snowShare >= 0.5) return "snow";
  if (wetShare >= 0.5) return "rain";
  const tally = new Map<WeatherCondition, number>();
  for (const s of samples) {
    const dry = s.condition === "clear" || s.condition === "wind" ? s.condition : "cloudy";
    tally.set(dry, (tally.get(dry) ?? 0) + 1);
  }
  let best: WeatherCondition = "cloudy";
  let bestCount = -1;
  for (const condition of ["cloudy", "clear", "wind"] as const) {
    const count = tally.get(condition) ?? 0;
    if (count > bestCount) {
      best = condition;
      bestCount = count;
    }
  }
  return best;
}
