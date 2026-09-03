import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getWeather } from "./weather";

type Daily = {
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  apparent_temperature_max?: number[];
  precipitation_probability_max?: number[];
  weather_code?: number[];
  wind_speed_10m_max?: number[];
};

function forecast(daily: Daily) {
  return {
    daily: {
      time: ["2026-09-02"],
      temperature_2m_max: [23.4],
      temperature_2m_min: [12.1],
      apparent_temperature_max: [21.8],
      precipitation_probability_max: [20],
      weather_code: [3],
      wind_speed_10m_max: [9],
      ...daily,
    },
  };
}

/** Fixture server: no network, one handler for each upstream. */
function stubFetch(daily: Daily = {}, place: unknown = { address: { city: "Leipzig" } }) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: unknown, init?: unknown) => {
    void init;
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://api.open-meteo.com/")) {
      return { ok: true, status: 200, json: async () => forecast(daily) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => place } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

/** Fresh coordinates per assertion so the 30 minute cache never masks a case. */
let seed = 0;
function nextCoords() {
  seed += 1;
  return { lat: Number((10 + seed * 0.37).toFixed(4)), lon: Number((10 + seed * 0.11).toFixed(4)) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getWeather WMO mapping", () => {
  const cases: [number, string][] = [
    [0, "clear"],
    [1, "clear"],
    [2, "cloudy"],
    [3, "cloudy"],
    [45, "cloudy"],
    [48, "cloudy"],
    [51, "rain"],
    [55, "rain"],
    [61, "rain"],
    [67, "rain"],
    [80, "rain"],
    [82, "rain"],
    [71, "snow"],
    [75, "snow"],
    [77, "snow"],
    [85, "snow"],
    [86, "snow"],
    [95, "storm"],
    [96, "storm"],
    [99, "storm"],
  ];

  for (const [code, condition] of cases) {
    it(`maps weather_code ${code} to ${condition}`, async () => {
      stubFetch({ weather_code: [code] });
      const result = await getWeather(nextCoords());
      expect(result.ok && result.weather.condition).toBe(condition);
    });
  }

  it("reports wind when a gale sits under an otherwise calm sky", async () => {
    stubFetch({ weather_code: [0], wind_speed_10m_max: [42] });
    const result = await getWeather(nextCoords());
    expect(result.ok && result.weather.condition).toBe("wind");
  });

  it("keeps precipitation over wind", async () => {
    stubFetch({ weather_code: [61], wind_speed_10m_max: [55] });
    const result = await getWeather(nextCoords());
    expect(result.ok && result.weather.condition).toBe("rain");
  });

  it("does not call 35 km/h windy", async () => {
    stubFetch({ weather_code: [2], wind_speed_10m_max: [35] });
    const result = await getWeather(nextCoords());
    expect(result.ok && result.weather.condition).toBe("cloudy");
  });
});

describe("getWeather response mapping", () => {
  it("maps the Open-Meteo daily block onto a WeatherSnapshot", async () => {
    const { calls } = stubFetch();
    const result = await getWeather(nextCoords());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.weather).toEqual({
      tempC: 23.4,
      feelsLikeC: 21.8,
      lowC: 12.1,
      precipitationChance: 20,
      condition: "cloudy",
      source: "forecast",
      place: "Leipzig",
    });
    expect(calls[0]).toContain("daily=temperature_2m_max");
    expect(calls[0]).toContain("forecast_days=1");
    expect(calls[0]).toContain("timezone=auto");
  });

  it("swallows a reverse geocoding failure", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      if (String(input).startsWith("https://api.open-meteo.com/")) {
        return { ok: true, status: 200, json: async () => forecast({}) } as unknown as Response;
      }
      throw new Error("nominatim is down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getWeather(nextCoords());
    expect(result.ok && result.weather.place).toBeUndefined();
  });

  it("sends the personal User-Agent when reverse geocoding", async () => {
    const { fetchMock } = stubFetch();
    await getWeather(nextCoords());
    const geocodeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith("https://nominatim.openstreetmap.org/"),
    );
    expect(geocodeCall).toBeDefined();
    const init = geocodeCall?.[1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers["User-Agent"]).toBe("Fitsss/0.1 (personal wardrobe app)");
  });

  it("returns an error instead of throwing when the forecast is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const result = await getWeather(nextCoords());
    expect(result).toEqual({
      ok: false,
      error: "Could not reach the weather service. Set the weather by hand.",
    });
  });

  it("rejects impossible coordinates without calling out", async () => {
    const { fetchMock } = stubFetch();
    const result = await getWeather({ lat: 120, lon: 0 });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves the same coordinates from cache", async () => {
    const { fetchMock } = stubFetch();
    const coords = nextCoords();
    await getWeather(coords);
    await getWeather(coords);
    const forecastCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).startsWith("https://api.open-meteo.com/"),
    );
    expect(forecastCalls).toHaveLength(1);
  });
});
