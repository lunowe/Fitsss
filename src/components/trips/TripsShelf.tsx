import Link from "next/link";
import { ChevronRight, CircleCheck, Loader2, Luggage, Plus } from "lucide-react";

import { CONDITION_ICON } from "@/components/today/conditions";
import { EmptyState, SectionHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TripShelfEntry } from "@/server/trips-queries";

import { dateRange, dayCount, dominantCondition, highsRange, lengthLine, monthAndDay, packedLine, placeLine } from "./format";

/** The large title's subtitle while the Trips segment shows: "2 upcoming". */
export function tripsSubtitle(entries: TripShelfEntry[]): string {
  if (entries.length === 0) return "No trips yet";
  const upcoming = entries.filter((entry) => !entry.isPast).length;
  return upcoming === 0 ? `${entries.length} past` : `${upcoming} upcoming`;
}

/**
 * The Trips segment of Looks: upcoming trips soonest first, then past ones,
 * each a row that reads at a glance (where, when, the weather, how much is
 * packed). Rendered on the server; the order comes from `listTripsForShelf`.
 */
export function TripsShelf({ entries }: { entries: TripShelfEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Luggage}
        title="Pack from what you own"
        body="Pick a place and dates. Fitsss checks the weather for every day and packs a bag from your closet, with an outfit a day."
        action={
          <Button className="w-full" asChild>
            <Link href="/trips/new">
              <Plus size={18} strokeWidth={2} aria-hidden />
              Plan a trip
            </Link>
          </Button>
        }
      />
    );
  }

  const upcoming = entries.filter((entry) => !entry.isPast);
  const past = entries.filter((entry) => entry.isPast);

  return (
    <div className="space-y-6 pt-2">
      {upcoming.length ? <TripGroup title="Upcoming" entries={upcoming} /> : null}
      {past.length ? <TripGroup title="Past" entries={past} /> : null}
    </div>
  );
}

function TripGroup({ title, entries }: { title: string; entries: TripShelfEntry[] }) {
  return (
    <section>
      <SectionHeader>{title}</SectionHeader>
      <ul className="mx-4 overflow-hidden rounded-xl bg-card">
        {entries.map((entry, index) => (
          <li key={entry.trip.id}>
            <TripRow entry={entry} first={index === 0} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TripRow({ entry, first }: { entry: TripShelfEntry; first: boolean }) {
  const { trip, isPast, isPacking } = entry;
  const { month, day } = monthAndDay(trip.startDate);
  const range = highsRange(trip.weather);
  const condition = dominantCondition(trip.weather);
  const WeatherIcon = condition ? CONDITION_ICON[condition] : null;
  const total = trip.plan?.packing.length ?? 0;
  const allPacked = Boolean(trip.plan && total > 0 && trip.plan.packing.every((item) => item.packed));

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block pl-4 transition-colors duration-100 active:bg-fill"
    >
      <div className={cn("flex items-start gap-3 py-3 pr-4", !first && "border-t border-separator")}>
        <div
          aria-hidden
          className="flex size-[52px] shrink-0 flex-col items-center justify-center rounded-[10px] bg-card-2"
        >
          <span
            className={cn(
              "text-[11px] font-semibold leading-[13px] tracking-[0.4px]",
              isPast ? "text-label-3" : "text-label-2",
            )}
          >
            {month}
          </span>
          <span className={cn("text-title-2 tabular-nums", isPast ? "text-label-2" : "text-label")}>{day}</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-headline text-label">{trip.name}</p>
          <p className="text-subhead text-label-2">
            {placeLine(trip.place)} · {dateRange(trip.startDate, trip.endDate)}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-footnote">
            {isPacking ? (
              <span className="inline-flex items-center gap-1.5 text-label-2">
                <Loader2 size={12} strokeWidth={2.25} className="animate-spin motion-reduce:animate-none" aria-hidden />
                Packing…
              </span>
            ) : isPast ? (
              <span className="text-label-2">{lengthLine(dayCount(trip))}</span>
            ) : allPacked ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CircleCheck size={13} strokeWidth={2.25} aria-hidden />
                All packed
              </span>
            ) : (
              <span className={trip.plan ? "text-label-2" : "text-tint"}>{packedLine(trip)}</span>
            )}
            {range && WeatherIcon ? (
              <>
                <span aria-hidden className="text-label-3">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 text-label-2">
                  <WeatherIcon size={13} strokeWidth={2} aria-hidden />
                  <span className="tabular-nums">{range}</span>
                </span>
              </>
            ) : null}
          </p>
        </div>

        <ChevronRight size={18} className="mt-[17px] shrink-0 text-label-3" aria-hidden />
      </div>
    </Link>
  );
}
