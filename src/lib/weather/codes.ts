import type { WeatherCondition } from "@/domain";

/**
 * WMO weather interpretation codes, collapsed onto our six conditions.
 * 0–1 clear, 2–3 cloudy (45/48 fog reads as cloudy too), 51–67 and 80–82 rain,
 * 71–77 and 85–86 snow, 95+ thunderstorm. A gale over an otherwise calm sky
 * is reported as wind, because that is what you have to dress for.
 */
export function conditionFromWeatherCode(code: number, windKmh: number): WeatherCondition {
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
