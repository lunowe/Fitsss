import { describe, expect, it } from "vitest";
import { addDays, tripDates } from "@/domain";
import { archiveWindow, forecastDays, sameDayYearsBack, typicalDays, TYPICAL_SPREAD } from "./weather";

/** An archive year: the window around the trip with one value per day. */
function year(start: string, end: string, values: { max: number; min: number; rain: number; code: number }) {
  const time = tripDates(start, end);
  return {
    time,
    temperature_2m_max: time.map(() => values.max),
    temperature_2m_min: time.map(() => values.min),
    apparent_temperature_max: time.map(() => values.max - 1),
    precipitation_sum: time.map(() => values.rain),
    weather_code: time.map(() => values.code),
    wind_speed_10m_max: time.map(() => 10),
  };
}

describe("typical weather", () => {
  const dates = ["2027-03-10", "2027-03-11"];

  it("averages the same days in past years and labels them typical", () => {
    const archives = [1, 2, 3, 4].map((k) => {
      const w = archiveWindow(dates[0], dates[1], k);
      // Two wet years at 14°, two dry ones at 18°.
      return year(w.start, w.end, k <= 2 ? { max: 14, min: 8, rain: 5, code: 61 } : { max: 18, min: 10, rain: 0, code: 1 });
    });
    const typical = typicalDays(archives, dates);
    expect(typical.get("2027-03-10")).toEqual({
      date: "2027-03-10",
      tempC: 16,
      lowC: 9,
      feelsLikeC: 15,
      precipitationChance: 50,
      condition: "rain",
      source: "typical",
    });
  });

  it("uses the days either side, and leaves out dates with no data at all", () => {
    const w = archiveWindow(dates[0], dates[1], 1);
    expect(w.start).toBe(addDays("2026-03-10", -TYPICAL_SPREAD));
    const typical = typicalDays([year(w.start, w.end, { max: 20, min: 12, rain: 0, code: 0 })], [...dates, "2027-06-01"]);
    expect(typical.get("2027-03-11")?.condition).toBe("clear");
    expect(typical.has("2027-06-01")).toBe(false);
  });

  it("does not read a missing rain total as a dry day", () => {
    const w = archiveWindow(dates[0], dates[1], 1);
    const missing = { ...year(w.start, w.end, { max: 12, min: 6, rain: 0, code: 61 }), precipitation_sum: [] };
    const typical = typicalDays([missing], dates);
    expect(typical.get("2027-03-10")).toMatchObject({ precipitationChance: 100, condition: "rain" });
  });

  it("reads 29 February as the 28th in years without one", () => {
    expect(sameDayYearsBack("2028-02-29", 1)).toBe("2027-02-28");
    expect(sameDayYearsBack("2028-02-29", 4)).toBe("2024-02-29");
  });
});

describe("forecast days", () => {
  it("keeps the trip's days and skips days without a temperature", () => {
    const days = forecastDays(
      {
        time: ["2026-10-27", "2026-10-28", "2026-10-29"],
        temperature_2m_max: [21.24, null, 19],
        temperature_2m_min: [14, 13, 12],
        precipitation_probability_max: [130, 20, 80],
        weather_code: [0, 3, 63],
        wind_speed_10m_max: [5, 5, 5],
      },
      ["2026-10-28", "2026-10-29"],
    );
    expect([...days.keys()]).toEqual(["2026-10-29"]);
    expect(days.get("2026-10-29")).toMatchObject({ tempC: 19, condition: "rain", precipitationChance: 80, source: "forecast" });
  });
});
