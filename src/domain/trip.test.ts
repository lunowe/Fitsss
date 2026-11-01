import { describe, expect, it } from "vitest";
import {
  checkTripPlan,
  defaultLuggage,
  derive,
  minimumCounts,
  packedVolume,
  paletteToBlockColor,
  settlePacking,
  tripDates,
  validateBlockInput,
  todayIn,
  validateTripInput,
  type Block,
  type RawTripPlan,
  type TripDayPlan,
  type TripPlanContext,
} from "@/domain";

const NOW = new Date("2026-10-26T08:00:00.000Z");

function block(id: string, raw: Record<string, unknown>): Block {
  const result = validateBlockInput({ pattern: "solid", quantity: 1, ...raw });
  if (!result.ok) throw new Error(`bad fixture: ${result.errors.join(", ")}`);
  return { ...result.value, ...derive(result.value), id, userId: "u", createdAt: NOW, updatedAt: NOW, archivedAt: null };
}

const tees = block("tee", { typeId: "t-shirt", color: paletteToBlockColor("white"), fit: "relaxed", material: "cotton", quantity: 4 });
const shirt = block("shirt", { typeId: "shirt", color: paletteToBlockColor("light-blue"), fit: "regular", material: "cotton" });
const jeans = block("jeans", { typeId: "jeans", color: paletteToBlockColor("denim"), fit: "straight", material: "denim", quantity: 2 });
const sneakers = block("sneakers", { typeId: "sneakers", color: paletteToBlockColor("white"), variant: "low-top" });
const boots = block("boots", { typeId: "boots", color: paletteToBlockColor("black"), variant: "chelsea", material: "leather" });
const closet = new Map([tees, shirt, jeans, sneakers, boots].map((b) => [b.id, b]));

const place = { name: "Lisbon", country: "Portugal", lat: 38.72, lon: -9.14, timezone: "Europe/Lisbon" };

function context(dates: string[], options: Partial<TripPlanContext["options"]> = {}): TripPlanContext {
  return {
    dates,
    wearableByDate: new Map(dates.map((d) => [d, closet])),
    closet,
    options: { laundry: false, luggage: "checked", ...options },
  };
}

function day(date: string, top: string, shoes = "sneakers") {
  return { date, name: "Look", slots: { top, bottom: "jeans", footwear: shoes, accessories: [] }, why: "." };
}

describe("validateTripInput", () => {
  const today = () => "2026-10-26";
  const base = { place, startDate: "2026-11-06", endDate: "2026-11-08" };

  it("accepts a weekend, names it after the place, and packs a carry-on", () => {
    const result = validateTripInput(base, today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Lisbon");
    expect(result.value.options).toEqual({ activities: [], luggage: "carry-on", laundry: false, styleId: undefined, steer: undefined });
  });

  it("gives a longer trip a checked bag unless told otherwise", () => {
    const week = validateTripInput({ ...base, endDate: "2026-11-12" }, today);
    expect(week.ok && week.value.options.luggage).toBe("checked");
    const light = validateTripInput({ ...base, endDate: "2026-11-12", luggage: "carry-on" }, today);
    expect(light.ok && light.value.options.luggage).toBe("carry-on");
  });

  it("refuses dates that make no trip", () => {
    for (const dates of [
      { startDate: "2026-11-08", endDate: "2026-11-06" },
      { startDate: "2026-11-01", endDate: "2026-11-22" },
      { startDate: "2026-10-20", endDate: "2026-10-22" },
      { startDate: "2028-01-01", endDate: "2028-01-02" },
      { startDate: "2026-02-30", endDate: "2026-03-02" },
    ]) {
      expect(validateTripInput({ place, ...dates }, today).ok, JSON.stringify(dates)).toBe(false);
    }
    // Three weeks to the day is fine.
    expect(validateTripInput({ place, startDate: "2026-11-01", endDate: "2026-11-21" }, today).ok).toBe(true);
  });

  it("reads the dates in the destination's calendar", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    // Kiritimati is already on the 27th: the 25th is two days ago there.
    const kiritimati = { ...place, timezone: "Pacific/Kiritimati" };
    const at = (zone: string) => todayIn(zone, now);
    expect(todayIn("Pacific/Kiritimati", now)).toBe("2026-10-27");
    expect(validateTripInput({ place: kiritimati, startDate: "2026-10-25", endDate: "2026-10-26" }, at).ok).toBe(false);
    expect(validateTripInput({ place: kiritimati, startDate: "2026-10-26", endDate: "2026-10-27" }, at).ok).toBe(true);
  });

  it("stores zones as the runtime spells them, names within the limit, and measures notes whole", () => {
    const lower = validateTripInput({ ...base, place: { ...place, timezone: "europe/lisbon" } }, today);
    expect(lower.ok && lower.value.place.timezone).toBe("Europe/Lisbon");
    const long = validateTripInput({ ...base, place: { ...place, name: "L".repeat(80) } }, today);
    expect(long.ok && [...long.value.name].length).toBe(60);
    expect(validateTripInput({ ...base, steer: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}".repeat(201) }, today).ok).toBe(false);
  });

  it("refuses a time zone that does not exist, and odd values without throwing", () => {
    expect(validateTripInput({ ...base, place: { ...place, timezone: "Not/AZone" } }, today).ok).toBe(false);
    expect(validateTripInput({ ...base, activities: [{ toString: null }] }, today).ok).toBe(false);
  });

  it("refuses a place without coordinates or a time zone, and unknown options", () => {
    expect(validateTripInput({ ...base, place: { ...place, lat: 200 } }, today).ok).toBe(false);
    expect(validateTripInput({ ...base, place: { ...place, timezone: "../etc" } }, today).ok).toBe(false);
    expect(validateTripInput({ ...base, place: { ...place, name: "​" } }, today).ok).toBe(false);
    expect(validateTripInput({ ...base, activities: ["skydiving"] }, today).ok).toBe(false);
    expect(validateTripInput({ ...base, luggage: "trunk" }, today).ok).toBe(false);
    expect(validateTripInput({ ...base, laundry: "yes" }, today).ok).toBe(false);
    expect(validateTripInput({ ...base, steer: "x".repeat(201) }, today).ok).toBe(false);
  });
});

describe("defaultLuggage", () => {
  it("is a carry-on up to three nights", () => {
    expect(defaultLuggage(tripDates("2026-11-06", "2026-11-09").length)).toBe("carry-on");
    expect(defaultLuggage(tripDates("2026-11-06", "2026-11-10").length)).toBe("checked");
  });
});

describe("checkTripPlan", () => {
  const sixDays = tripDates("2026-11-06", "2026-11-11");

  it("never packs more of a piece than is owned, and says so when the days want more", () => {
    const raw: RawTripPlan = {
      days: sixDays.map((d) => day(d, "tee")),
      packing: [{ blockId: "tee", count: 9 }],
      tips: [],
    };
    const { plan, problems } = checkTripPlan(raw, context(sixDays));
    expect(problems).toEqual([]);
    expect(plan.packing.find((p) => p.blockId === "tee")?.count).toBe(4);
    expect(plan.warnings.join(" ")).toMatch(/worn 6 days; you have 4 and no laundry/);
    // Jeans go three days each: two pairs for six days.
    expect(plan.packing.find((p) => p.blockId === "jeans")?.count).toBe(2);
    expect(plan.packing.find((p) => p.blockId === "sneakers")?.count).toBe(1);
  });

  it("needs half as many with laundry", () => {
    const raw: RawTripPlan = { days: sixDays.map((d) => day(d, "tee")), packing: [], tips: [] };
    const { plan } = checkTripPlan(raw, context(sixDays, { laundry: true }));
    expect(plan.packing.find((p) => p.blockId === "tee")?.count).toBe(3);
    expect(plan.packing.find((p) => p.blockId === "jeans")?.count).toBe(1);
    expect(plan.warnings).toEqual([]);
  });

  it("packs everything worn even when the model forgot to list it", () => {
    const dates = tripDates("2026-11-06", "2026-11-07");
    const raw: RawTripPlan = { days: [day(dates[0], "shirt", "boots"), day(dates[1], "tee")], packing: [], tips: [] };
    const ids = checkTripPlan(raw, context(dates)).plan.packing.map((p) => p.blockId).sort();
    expect(ids).toEqual(["boots", "jeans", "shirt", "sneakers", "tee"]);
  });

  it("flags a missing day, a piece not wearable that day, and pieces it does not know", () => {
    const dates = tripDates("2026-11-06", "2026-11-08");
    const ctx = context(dates);
    ctx.wearableByDate.set(dates[1], new Map([...closet].filter(([id]) => id !== "boots")));
    const raw: RawTripPlan = {
      days: [day(dates[0], "tee"), day(dates[1], "tee", "boots")],
      packing: [{ blockId: "someone-elses", count: 1 }],
      tips: [],
    };
    const { plan, problems } = checkTripPlan(raw, ctx);
    expect(problems.some((p) => p.startsWith(dates[1]))).toBe(true);
    expect(problems.some((p) => p.startsWith(`${dates[2]}: no outfit`))).toBe(true);
    expect(plan.days.map((d) => d.date)).toEqual([dates[0]]);
    expect(plan.packing.some((p) => p.blockId === "someone-elses")).toBe(false);
  });

  it("knows when the bag is too small, and that the travel outfit takes no room", () => {
    const dates = tripDates("2026-11-06", "2026-11-09");
    const raw: RawTripPlan = {
      days: dates.map((d, i) => day(d, i === 0 ? "shirt" : "tee", i === 0 ? "boots" : "sneakers")),
      packing: [{ blockId: "tee", count: 4 }],
      tips: [],
    };
    const roomy = checkTripPlan(raw, context(dates, { luggage: "carry-on" }));
    // 4 tees (8) + shirt (2) + jeans ×2 (6) + boots (6) + sneakers (5) = 27, less the
    // shirt, the jeans and the boots worn on the way (2 + 3 + 6) = 16.
    expect(packedVolume(roomy.plan.packing, closet, roomy.plan.days[0].outfit)).toBe(16);
    expect(roomy.problems).toEqual([]);

    const crowded = checkTripPlan(
      { ...raw, packing: [{ blockId: "tee", count: 20 }] },
      { ...context(dates, { luggage: "carry-on" }), closet: new Map([...closet, ["tee", { ...tees, quantity: 20 }]]) },
    );
    // 20 tees (40) + the rest (19), less the 11 worn on the way: 48.
    expect(crowded.problems.join(" ")).toMatch(/needs 48 units of room; a carry-on holds 40/);
    expect(crowded.plan.warnings.join(" ")).toMatch(/more than fits in a carry-on/);
  });

  it("wants a coat on a day cold enough for one, and says so when none is worn", () => {
    const coat = block("coat", { typeId: "wool-coat", color: paletteToBlockColor("camel"), fit: "regular", material: "wool" });
    const dates = tripDates("2026-12-01", "2026-12-02");
    const withCoat = new Map([...closet, ["coat", coat]]);
    const ctx: TripPlanContext = {
      ...context(dates),
      closet: withCoat,
      wearableByDate: new Map(dates.map((d) => [d, withCoat])),
      needsOuterwear: new Set([dates[1]]),
    };
    const raw: RawTripPlan = { days: dates.map((d) => day(d, "tee")), packing: [], tips: [] };
    const { plan, problems } = checkTripPlan(raw, ctx);
    expect(problems).toEqual([`${dates[1]}: outerwear is required that day`]);
    expect(plan.warnings[0]).toBe("Dec 2 is cold enough for a coat, and the plan has none for it.");
  });

  it("names a worn piece that has left the closet, and does not pack it", () => {
    const dates = tripDates("2026-11-06", "2026-11-07");
    const days: TripDayPlan[] = dates.map((date) => ({
      date,
      outfit: { id: date, name: "x", why: "", slots: { top: "tee", bottom: "jeans", footwear: "sneakers", accessories: [] } },
    }));
    const active = new Map([...closet].filter(([id]) => id !== "jeans"));
    const { packing, warnings } = settlePacking(days, [], active, { laundry: false, luggage: "checked" }, new Map([["jeans", jeans]]));
    expect(packing.some((p) => p.blockId === "jeans")).toBe(false);
    expect(warnings).toEqual([`${jeans.label[0].toUpperCase()}${jeans.label.slice(1)} is no longer in your closet: swap it on Nov 6 and Nov 7.`]);
  });

  it("caps tips and drops empty ones", () => {
    const dates = tripDates("2026-11-06", "2026-11-06");
    const raw: RawTripPlan = { days: [day(dates[0], "tee")], packing: [], tips: ["", "a", "b", "​", "c", "d", "e"] };
    expect(checkTripPlan(raw, context(dates)).plan.tips).toEqual(["a", "b", "c", "d"]);
  });
});

describe("settlePacking", () => {
  const dates = tripDates("2026-11-06", "2026-11-07");
  const days: TripDayPlan[] = dates.map((date) => ({
    date,
    outfit: { id: date, name: "x", why: "", slots: { top: "tee", bottom: "jeans", footwear: "sneakers", accessories: [] } },
  }));

  it("keeps ticks and spares, tops up what the days need, and drops pieces that are gone", () => {
    const { packing } = settlePacking(
      days,
      [
        { blockId: "tee", count: 1, packed: true },
        { blockId: "boots", count: 1, packed: true },
        { blockId: "archived", count: 1, packed: false },
      ],
      closet,
      { laundry: false, luggage: "checked" },
    );
    expect(packing.find((p) => p.blockId === "tee")).toEqual({ blockId: "tee", count: 2, packed: true });
    expect(packing.find((p) => p.blockId === "boots")).toEqual({ blockId: "boots", count: 1, packed: true });
    expect(packing.some((p) => p.blockId === "archived")).toBe(false);
  });

  it("says which slot lost a deleted piece, once per piece", () => {
    const gone = new Map([...closet].filter(([id]) => id !== "jeans" && id !== "sneakers"));
    const { warnings } = settlePacking(days, [], gone, { laundry: false, luggage: "checked" });
    expect(warnings).toEqual([
      "The bottom worn on Nov 6 and Nov 7 has been deleted from your closet: swap it there.",
      "The pair of shoes worn on Nov 6 and Nov 7 has been deleted from your closet: swap it there.",
    ]);
  });

  it("flags a worn piece re-filed under another kind since packing", () => {
    const refiled = new Map([...closet, ["tee", { ...tees, category: "footwear" as const }]]);
    const { warnings } = settlePacking(days, [], refiled, { laundry: false, luggage: "checked" });
    expect(warnings.some((w) => w.includes("has changed since packing: swap it on Nov 6 and Nov 7."))).toBe(true);
  });

  it("knows the least each piece can drop to", () => {
    const floor = minimumCounts(days, closet, false);
    expect(floor.get("tee")).toBe(2);
    expect(floor.get("jeans")).toBe(1);
    expect(floor.has("boots")).toBe(false);
  });
});
