"use client";

import { ArrowLeftRight, Lightbulb } from "lucide-react";

import { OutfitFlatLay } from "@/components/outfit";
import { CONDITION_ICON } from "@/components/today/conditions";
import { InsetGroup } from "@/components/shell";
import { type Block, type TripDayWeather, type TripPlan } from "@/domain";

import { dayTitle, dayTitleLong, degrees } from "./format";
import { PieceThumb, pieceEntries, pieceTitle, roleLabel, type PieceEntry } from "./pieces";

export interface SwapTarget {
  date: string;
  entry: PieceEntry;
}

/**
 * One section a day: the date and its weather, the outfit as a flat lay with
 * its name, why it works and the tip, then its pieces, each a row that offers
 * to swap it. A slot whose piece has left the closet keeps its row so that
 * day can be fixed without packing again.
 */
export function DayPlans({
  plan,
  weather,
  blocks,
  byId,
  locked,
  onSwap,
}: {
  plan: TripPlan;
  weather: TripDayWeather[];
  blocks: Block[];
  byId: Map<string, Block>;
  /** Packing in progress: swaps wait. */
  locked: boolean;
  onSwap: (target: SwapTarget) => void;
}) {
  return (
    <div className="space-y-6">
      {plan.days.map((day) => {
        const forecast = weather.find((w) => w.date === day.date);
        const entries = pieceEntries(day.outfit.slots, byId);
        return (
          <section key={day.date} aria-label={dayTitleLong(day.date)}>
            <DayHeader date={day.date} weather={forecast} />
            <InsetGroup className="mx-4">
              <div>
                <div className="flex gap-3 p-3">
                  <OutfitFlatLay blocks={blocks} slots={day.outfit.slots} size="sm" className="w-[132px] shrink-0" />
                  <div className="min-w-0 flex-1 py-0.5">
                    <h3 className="text-headline text-label">{day.outfit.name}</h3>
                    {day.outfit.why ? <p className="mt-1 text-subhead text-label-2">{day.outfit.why}</p> : null}
                    {day.outfit.tip?.trim() ? (
                      <p className="mt-2 flex items-start gap-1.5 text-footnote text-label-2">
                        <Lightbulb size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-label-3" aria-hidden />
                        <span>{day.outfit.tip}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
              {entries.map((entry) => (
                <PieceRow
                  key={entry.key}
                  entry={entry}
                  disabled={locked}
                  onClick={() => onSwap({ date: day.date, entry })}
                />
              ))}
            </InsetGroup>
          </section>
        );
      })}
    </div>
  );
}

/** "Sat 7 Nov" with the day's weather trailing: the icon and the high, a tilde before a typical one. */
function DayHeader({ date, weather }: { date: string; weather?: TripDayWeather }) {
  const Icon = weather ? CONDITION_ICON[weather.condition] : null;
  const typical = weather?.source === "typical";
  return (
    <div className="mb-2 flex items-center justify-between px-4 text-footnote font-medium uppercase tracking-[0.4px] text-label-2">
      <h2>{dayTitle(date)}</h2>
      {weather && Icon ? (
        <span
          className="flex items-center gap-1 tabular-nums"
          aria-label={`high ${degrees(weather.tempC)}${typical ? ", typical for the date" : ""}`}
        >
          <Icon size={14} strokeWidth={2} aria-hidden />
          {typical ? "~" : ""}
          {degrees(weather.tempC)}
        </span>
      ) : null}
    </div>
  );
}

function PieceRow({ entry, disabled, onClick }: { entry: PieceEntry; disabled: boolean; onClick: () => void }) {
  const role = roleLabel(entry.role);
  const title = entry.block && entry.inCloset ? pieceTitle(entry.block) : entry.block ? `${role}: ${pieceTitle(entry.block)}` : role;
  const subtitle = entry.inCloset ? role : "No longer in your closet";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${title}, ${subtitle}. ${entry.inCloset ? "Swap this piece" : "Pick a piece for this slot"}`}
      className="block w-full pl-4 text-left transition-colors duration-100 active:bg-fill disabled:opacity-50"
    >
      <div className="flex min-h-11 items-center gap-3 py-2 pr-4">
        <PieceThumb block={entry.block} dimmed={!entry.inCloset} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-label">{title}</span>
          <span className="block truncate text-subhead text-label-2">{subtitle}</span>
        </span>
        <ArrowLeftRight size={16} strokeWidth={2} className="shrink-0 text-label-3" aria-hidden />
      </div>
    </button>
  );
}
