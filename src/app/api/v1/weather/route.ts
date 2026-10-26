import { data, failure, invalid } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { getWeather } from "@/server/weather";

/**
 * GET /api/v1/weather?lat=…&lon=… — today's `WeatherSnapshot` from the
 * forecast (cached per place for 30 minutes). Behind sign-in so the server
 * is not an open weather proxy. A 503 means "set it by hand".
 */
export const GET = withUser(async (request) => {
  const params = new URL(request.url).searchParams;
  // Plain decimals only: `Number("")` is 0 (the equator) and `Number("0x10")` is 16.
  const decimal = (raw: string | null) => (raw && /^-?\d{1,3}(\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN);
  const lat = decimal(params.get("lat"));
  const lon = decimal(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return invalid(["lat and lon: a latitude and a longitude in degrees"]);
  }
  const result = await getWeather({ lat, lon });
  return result.ok ? data(result.weather) : failure(503, "not_configured", result.error);
});
