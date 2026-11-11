import { addDays, type Trip, type TripDayWeather, type TripPlace, type WeatherCondition } from "@/domain";

/**
 * Dates and short lines for a trip. Trip dates are wall dates (YYYY-MM-DD),
 * so they are read and written in UTC with one fixed locale: the server and
 * the browser format them identically, wherever either is.
 */

const LOCALE = "en-GB";
const SHORT = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const SHORT_YEAR = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const LONG = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" });

function asDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function isThisYear(date: string): boolean {
  return asDate(date).getUTCFullYear() === new Date().getFullYear();
}

/** "Sat 7 Nov", with the year when it isn't this one. */
export function dayTitle(date: string): string {
  return (isThisYear(date) ? SHORT : SHORT_YEAR).format(asDate(date));
}

/** "Saturday 7 November", for screen readers. */
export function dayTitleLong(date: string): string {
  return LONG.format(asDate(date));
}

/** "Sat 7 Nov – Sat 14 Nov". */
export function dateRange(start: string, end: string): string {
  if (start === end) return dayTitle(start);
  const withYear = !isThisYear(start) || !isThisYear(end);
  const format = withYear ? SHORT_YEAR : SHORT;
  return `${format.format(asDate(start))} – ${format.format(asDate(end))}`;
}

/** ("NOV", "7") for the shelf's date tile. */
export function monthAndDay(date: string): { month: string; day: string } {
  const d = asDate(date);
  return { month: MONTH.format(d).toUpperCase(), day: String(d.getUTCDate()) };
}

/** "Sat". */
export function weekday(date: string): string {
  return WEEKDAY.format(asDate(date));
}

export function dayCount(trip: Pick<Trip, "startDate" | "endDate">): number {
  return Math.round((asDate(trip.endDate).getTime() - asDate(trip.startDate).getTime()) / 86_400_000) + 1;
}

/** "8 days". */
export function lengthLine(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** "8 days · 7 nights". */
export function lengthWithNights(days: number): string {
  const nights = Math.max(days - 1, 0);
  return `${lengthLine(days)} · ${nights} ${nights === 1 ? "night" : "nights"}`;
}

/** "Sat 7 Nov – Sat 14 Nov · 8 days", the detail's subtitle. */
export function tripSubtitle(trip: Trip): string {
  return `${dateRange(trip.startDate, trip.endDate)} · ${lengthLine(dayCount(trip))}`;
}

/** "Lisbon, Portugal": the country tells two Lisbons apart; the region is noise once chosen. */
export function placeLine(place: TripPlace): string {
  const tail = place.country ?? place.region;
  return tail && tail !== place.name ? `${place.name}, ${tail}` : place.name;
}

/** "Lisbon District, Portugal": what tells a search result apart. */
export function placeDetail(place: TripPlace): string {
  return [place.region, place.country].filter((part) => part && part !== place.name).join(", ");
}

/** "9 of 17 packed", "All packed", "Not packed yet". */
export function packedLine(trip: Trip): string {
  if (!trip.plan) return "Not packed yet";
  const total = trip.plan.packing.length;
  const packed = trip.plan.packing.filter((item) => item.packed).length;
  if (total === 0) return "Nothing to pack";
  if (packed === total) return "All packed";
  return `${packed} of ${total} packed`;
}

export function degrees(value: number): string {
  // `Math.round(-0.4)` is -0, which prints as "0" anyway; this keeps "-0°" out.
  return `${Math.round(value) || 0}°`;
}

/** "18–20°", the range of daytime highs. */
export function highsRange(days: TripDayWeather[]): string | null {
  if (!days.length) return null;
  const highs = days.map((day) => Math.round(day.tempC) || 0);
  const low = Math.min(...highs);
  const high = Math.max(...highs);
  return low === high ? `${high}°` : `${low}–${high}°`;
}

/** The condition most days share, for one icon at a glance. */
export function dominantCondition(days: TripDayWeather[]): WeatherCondition | null {
  const counts = new Map<WeatherCondition, number>();
  for (const day of days) counts.set(day.condition, (counts.get(day.condition) ?? 0) + 1);
  let best: WeatherCondition | null = null;
  for (const [condition, count] of counts) {
    if (best === null || count > counts.get(best)!) best = condition;
  }
  return best;
}

/** Under the weather strip when some days are typical, not forecast. */
export function typicalNote(days: TripDayWeather[]): string | null {
  if (!days.some((day) => day.source === "typical")) return null;
  const lastForecast = [...days].reverse().find((day) => day.source === "forecast");
  if (lastForecast) {
    return `The forecast reaches ${dayTitle(lastForecast.date)}. Days after it show what’s typical for the date in recent years, marked ~.`;
  }
  return "These dates are beyond the forecast: each day shows what’s typical for the date in recent years, marked ~.";
}

/** Today's date in this browser, YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export { addDays };
