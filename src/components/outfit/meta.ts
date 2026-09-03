import { getOccasion, type WeatherSnapshot } from "@/domain";

/**
 * The quiet second line under an outfit: "Everyday · Clean minimal · 21°".
 * Missing parts are simply left out.
 */
export function outfitMeta({
  occasion,
  styleName,
  weather,
}: {
  occasion?: string | null;
  styleName?: string | null;
  weather?: WeatherSnapshot | null;
}): string {
  const parts: string[] = [];
  const label = occasion ? getOccasion(occasion)?.label : undefined;
  if (label) parts.push(label);
  if (styleName) parts.push(styleName);
  if (weather) parts.push(`${Math.round(weather.tempC)}°`);
  return parts.join(" · ");
}
