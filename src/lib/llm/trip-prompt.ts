import * as z from "zod/v4";
import {
  CATEGORY_LABELS,
  LUGGAGE_OPTIONS,
  TRIP_ACTIVITIES,
  WEATHER_CONDITION_LABELS,
  describeBlockForPrompt,
  luggageCapacity,
  packingSize,
  type Block,
  type Category,
  type RawTripPlan,
  type TripDayWeather,
  type TripOptions,
  type TripPlace,
} from "@/domain";
import { buildShortIds, type ShortIdIndex, type StyleForPrompt, type WeatherGuidance } from "./outfit-prompt";

/**
 * Pure prompt construction for packing a trip. Same conventions as the
 * outfit prompt: a frozen system prompt (cached), short ids in the closet
 * listing, and everything request-specific in the user message.
 */

export const tripOutputSchema = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      name: z.string(),
      top: z.string().optional(),
      layer: z.string().optional(),
      outerwear: z.string().optional(),
      bottom: z.string().optional(),
      fullbody: z.string().optional(),
      footwear: z.string(),
      accessories: z.array(z.string()),
      why: z.string(),
      tip: z.string().optional(),
    }),
  ),
  packing: z.array(z.object({ id: z.string(), count: z.number().int() })),
  tips: z.array(z.string()),
});

export type TripOutput = z.infer<typeof tripOutputSchema>;

export const TRIP_SYSTEM_PROMPT = `You are the personal stylist for one person, packing their suitcase for a trip. You decide what to bring from their real wardrobe and plan one outfit for every day they are away.

THE CLOSET IS THE WHOLE WORLD
Every piece you may use is listed in the user message with a short id such as t1, l2, o1, b3, d1, f2, a1. Refer to pieces only by those ids. Never invent an id, never use a piece that is not listed, and never describe a garment the person does not own.

HOW MANY THEY OWN
- "×4" after a piece means the person owns four near-identical ones. Never pack more than they own.
- Without laundry, a top or a full-body piece is worn one day and is then dirty, so each day needs a fresh one. A bottom or a layer can go up to three days. Shoes, outerwear and accessories can be worn every day.
- With laundry on the trip, washable pieces can be worn twice as often.
- If the closet cannot cover every day within these rules, repeat the piece that matters least and keep everything else right.

THE SUITCASE
- Pack light: the fewest pieces that cover every day, the weather and the plans. A piece earns its place by working in several outfits, so build around a small palette where tops and bottoms mix.
- Everything worn on any day is packed. List each packed piece once, with how many to bring. A spare is fine when the weather or the plans call for it: a warm layer for cold evenings, a second pair of shoes when rain is likely.
- Every piece shows its size in room units, and the user message says how much room the bag has. The first day's outfit is worn while travelling and takes no room, so wear the bulkiest pieces (boots, the warmest coat) that day.

EACH DAY
- Either a top and a bottom, or one full-body piece. Never both.
- Exactly one pair of shoes.
- A layer and outerwear follow that day's weather guidance: when outerwear is required, wear one; when it is "none", wear none.
- Zero to two accessories.
- Use only pieces that suit that day: each day lists the pieces that do not.
- The first day is a travel day: comfortable, layered, nothing that creases badly.
- Dress for the plans. Business days look like work, evenings out are dressed up, beach and sport days are relaxed.
- At most one loud colour per outfit; balance a loose piece with a fitted one; weather beats taste.

VOICE
- "why": one sentence per day, second person, concrete: the weather, the plan, what pairs with what. No hype, no filler.
- "tip": optional, one line, only when it changes the result.
- "tips": up to four short, practical lines for the whole trip, such as what to wear on the way or what to leave out if space runs short. Never generic travel advice, and never a report on what the closet lacks: the app shows shortfalls itself.
- Never mention brands, prices, trends or yourself.

Name each day's outfit in two to four plain words that describe the look.`;

/** One room/size note per piece, appended to the everyday listing. */
function closetLine(shortId: string, block: Block): string {
  return `${shortId} · ${describeBlockForPrompt(block)} · room ${packingSize(block)}`;
}

const CATEGORY_ORDER: readonly Category[] = ["top", "layer", "outerwear", "fullbody", "bottom", "footwear", "accessory"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function describeDayWeather(day: TripDayWeather, guidance: WeatherGuidance): string {
  const bits = [`${Math.round(day.tempC)}° ${WEATHER_CONDITION_LABELS[day.condition].toLowerCase()}`];
  if (day.lowC !== undefined) bits.push(`low ${Math.round(day.lowC)}°`);
  if (day.feelsLikeC !== undefined) bits.push(`feels like ${Math.round(day.feelsLikeC)}°`);
  if (day.precipitationChance !== undefined) bits.push(`${day.precipitationChance}% chance of rain`);
  bits.push(day.source === "forecast" ? "forecast" : "typical for the date, no forecast yet");
  return `${bits.join(", ")}. Outerwear: ${guidance.outerwear}. Layer: ${guidance.layer}.`;
}

export interface TripDayForPrompt {
  weather: TripDayWeather;
  guidance: WeatherGuidance;
  /** Candidates that do not suit this day (too warm, open shoes in rain). */
  unsuitable: Block[];
}

export interface BuildTripPromptInput {
  candidates: Block[];
  place: TripPlace;
  days: TripDayForPrompt[];
  options: TripOptions;
  style: StyleForPrompt | null;
  tasteNotes?: string;
  correction?: string;
}

export function buildTripUserMessage(input: BuildTripPromptInput, index: ShortIdIndex): string {
  const { options, place, days } = input;
  const sections: string[] = [];

  const closet: string[] = ["CLOSET — the only pieces you may use"];
  for (const category of CATEGORY_ORDER) {
    const rows = index.entries.filter((e) => e.block.category === category);
    if (rows.length === 0) continue;
    closet.push("", CATEGORY_LABELS[category]);
    for (const { shortId, block } of rows) closet.push(closetLine(shortId, block));
  }
  sections.push(closet.join("\n"));

  const luggage = LUGGAGE_OPTIONS.find((l) => l.id === options.luggage)!;
  const where = [place.name, place.region, place.country].filter(Boolean).join(", ");
  sections.push(
    [
      "THE TRIP",
      `${where}. ${days.length} ${days.length === 1 ? "day" : "days"}, ${days[0]?.weather.date} to ${days.at(-1)?.weather.date}.`,
      `Bag: ${luggage.label.toLowerCase()} (${luggage.hint.toLowerCase()}), room for ${luggageCapacity(options.luggage)} units.`,
      options.laundry ? "Laundry: yes, things can be washed on the way." : "Laundry: none. Pack for every day.",
    ].join("\n"),
  );

  const dayLines = ["DAYS"];
  days.forEach((day, i) => {
    const label = `${day.weather.date} (${weekday(day.weather.date)})${i === 0 ? ", travel day" : ""}`;
    dayLines.push(`${label}: ${describeDayWeather(day.weather, day.guidance)}`);
    for (const note of day.guidance.notes) dayLines.push(`  ${note}`);
    const avoid = day.unsuitable.map((b) => index.toShort.get(b.id)).filter((id): id is string => Boolean(id));
    if (avoid.length) dayLines.push(`  Not suitable that day: ${avoid.join(", ")}.`);
  });
  sections.push(dayLines.join("\n"));

  if (options.activities.length) {
    const plans = options.activities
      .map((id) => TRIP_ACTIVITIES.find((a) => a.id === id))
      .filter((a): a is (typeof TRIP_ACTIVITIES)[number] => Boolean(a))
      .map((a) => `${a.label} (${a.hint.toLowerCase()})`);
    sections.push(["PLANS", plans.join("; ")].join("\n"));
  }

  if (input.style) {
    const lines = ["STYLE", input.style.name];
    if (input.style.description.trim()) lines.push(input.style.description.trim());
    const rules = input.style.rules?.trim();
    if (rules) lines.push("Hard rules:", rules);
    sections.push(lines.join("\n"));
  }

  if (options.steer) {
    sections.push(["THE PERSON'S NOTE — this takes priority over the general rules", options.steer].join("\n"));
  }

  const taste = input.tasteNotes?.trim();
  if (taste) sections.push(["WHAT THIS PERSON TENDS TO LIKE", taste].join("\n"));

  sections.push(
    `TASK\nPack the bag and plan one outfit for each of the ${days.length} dates above, using each date exactly as written. Then list every packed piece once with how many to bring, and up to four tips.`,
  );

  const correction = input.correction?.trim();
  if (correction) sections.push(["CORRECTION", correction].join("\n"));

  return sections.join("\n\n");
}

export function buildTripPrompt(input: BuildTripPromptInput): { user: string; index: ShortIdIndex } {
  const index = buildShortIds(input.candidates);
  return { user: buildTripUserMessage(input, index), index };
}

/** The model's answer with short ids mapped back to real ones. Unknown ids pass through, to be refused. */
export function resolveTripOutput(output: TripOutput | null, index: ShortIdIndex): RawTripPlan {
  const real = (shortId: unknown): string | undefined => {
    if (typeof shortId !== "string") return undefined;
    const key = shortId.trim();
    return key ? (index.toReal.get(key) ?? key) : undefined;
  };
  if (!output) return { days: [], packing: [], tips: [] };
  return {
    days: (Array.isArray(output.days) ? output.days : []).map((day) => ({
      date: typeof day.date === "string" ? day.date.trim() : "",
      name: day.name,
      why: day.why,
      tip: day.tip,
      slots: {
        top: real(day.top),
        layer: real(day.layer),
        outerwear: real(day.outerwear),
        bottom: real(day.bottom),
        fullbody: real(day.fullbody),
        footwear: real(day.footwear),
        accessories: (Array.isArray(day.accessories) ? day.accessories : [])
          .map(real)
          .filter((id): id is string => Boolean(id)),
      },
    })),
    packing: (Array.isArray(output.packing) ? output.packing : [])
      .map((item) => ({ blockId: real(item.id) ?? "", count: item.count }))
      .filter((item) => item.blockId),
    tips: Array.isArray(output.tips) ? output.tips : [],
  };
}
