"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, Luggage, MapPin, Search, X } from "lucide-react";

import {
  BottomBar,
  Chip,
  ChipRow,
  InsetGroup,
  Row,
  RowIcon,
  SectionFooter,
  SectionHeader,
  SegmentedControl,
} from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CARRY_ON_MAX_NIGHTS,
  LUGGAGE_OPTIONS,
  MAX_TRIP_DAYS,
  MAX_TRIP_LEAD_DAYS,
  MAX_TRIP_STEER_LENGTH,
  TRIP_ACTIVITIES,
  daysBetween,
  defaultLuggage,
  isIsoDate,
  todayIn,
  type LuggageId,
  type TripActivityId,
  type TripPlace,
} from "@/domain";
import { cn } from "@/lib/utils";
import { createTrip, searchTripPlaces } from "@/server/trips";

import { addDays, lengthWithNights, limitText, localToday, placeDetail } from "./format";
import { DateField } from "./DateField";
import { readableError } from "./errors";
import { NoteCount } from "./TripSheets";

export interface StyleOption {
  id: string;
  name: string;
}

/**
 * "Plan a trip": where, when, what for, the bag, laundry, a style and a note.
 * Every vocabulary comes from the domain. Creating is quick (the server
 * fetches the weather); packing is the slow part and belongs to the trip's
 * page, which this hands over to with `?pack=1`.
 */
export function PlanTripForm({ styles }: { styles: StyleOption[] }) {
  const router = useRouter();

  const [place, setPlace] = useState<TripPlace | null>(null);
  const [start, setStart] = useState(() => localToday());
  const [end, setEnd] = useState(() => addDays(localToday(), 2));
  const [activities, setActivities] = useState<TripActivityId[]>([]);
  /** Null until the person picks a bag: until then it follows the length. */
  const [pickedLuggage, setPickedLuggage] = useState<LuggageId | null>(null);
  const [laundry, setLaundry] = useState(false);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Today where the trip goes (this browser's today until a place is
  // chosen): the server judges the dates by the destination's calendar.
  const today = place ? todayIn(place.timezone) : localToday();
  const latestStart = addDays(today, MAX_TRIP_LEAD_DAYS);
  const latestEnd = isIsoDate(start) ? addDays(start, MAX_TRIP_DAYS - 1) : undefined;

  const datesComplete = isIsoDate(start) && isIsoDate(end);
  const days = datesComplete ? daysBetween(start, end) + 1 : 0;
  const datesValid = datesComplete && start >= today && start <= latestStart && end >= start && days <= MAX_TRIP_DAYS;
  const luggage = pickedLuggage ?? defaultLuggage(Math.max(days, 1));
  const canPack = place !== null && datesValid && !creating;

  /**
   * Keeps both dates inside the rules: the end follows the start and never
   * runs past the longest trip. Run when a date field is left (and when the
   * place changes), never per keystroke: typing passes through dates like
   * 0002-11-20 that would snap to today.
   */
  function clamp(nextStart: string, nextEnd: string, nextToday = today) {
    let s = nextStart;
    let e = nextEnd;
    if (isIsoDate(s)) {
      if (s < nextToday) s = nextToday;
      if (s > addDays(nextToday, MAX_TRIP_LEAD_DAYS)) s = addDays(nextToday, MAX_TRIP_LEAD_DAYS);
      if (isIsoDate(e)) {
        if (e < s) e = s;
        if (e > addDays(s, MAX_TRIP_DAYS - 1)) e = addDays(s, MAX_TRIP_DAYS - 1);
      }
    }
    setStart(s);
    setEnd(e);
  }

  function choosePlace(next: TripPlace | null) {
    setPlace(next);
    setError(null);
    if (next) clamp(start, end, todayIn(next.timezone));
  }

  function toggleActivity(id: TripActivityId) {
    setActivities((current) =>
      current.includes(id)
        ? current.filter((a) => a !== id)
        : TRIP_ACTIVITIES.map((a) => a.id).filter((a) => a === id || current.includes(a)),
    );
  }

  async function create() {
    if (!canPack || !place) return;
    setError(null);
    setCreating(true);
    let result: Awaited<ReturnType<typeof createTrip>>;
    try {
      result = await createTrip({
        place,
        startDate: start,
        endDate: end,
        activities,
        luggage,
        laundry,
        styleId: styleId ?? undefined,
        steer: note.trim() || undefined,
      });
    } catch {
      setCreating(false);
      setError("Could not plan this trip. Check your connection and try again.");
      return;
    }
    if (!result.ok) {
      setCreating(false);
      setError(readableError(result.errors?.[0] ?? result.error));
      return;
    }
    // Stays "creating" while the page changes: a second tap must not make a second trip.
    router.push(`/trips/${result.trip.id}?pack=1`);
  }

  const chosenHints = TRIP_ACTIVITIES.filter((a) => activities.includes(a.id));
  const bagHint = LUGGAGE_OPTIONS.find((option) => option.id === luggage)?.hint;

  return (
    <>
      <fieldset disabled={creating} className="min-w-0 space-y-6 pt-2">
        <section>
          <SectionHeader>Where</SectionHeader>
          <PlaceField place={place} onChange={choosePlace} />
        </section>

        <section>
          <SectionHeader>When</SectionHeader>
          <InsetGroup className="mx-4">
            <Row
              title="Start"
              trailing={
                <DateField
                  label="Start date"
                  value={start}
                  min={today}
                  max={latestStart}
                  onChange={setStart}
                  onCommit={() => clamp(start, end)}
                />
              }
            />
            <Row
              title="End"
              trailing={
                <DateField
                  label="End date"
                  value={end}
                  min={isIsoDate(start) ? start : today}
                  max={latestEnd}
                  onChange={setEnd}
                  onCommit={() => clamp(start, end)}
                />
              }
            />
          </InsetGroup>
          <SectionFooter className={cn(!datesValid && datesComplete && "text-destructive")}>
            {datesValid
              ? lengthWithNights(days)
              : `Plan up to ${MAX_TRIP_DAYS} days at a time, from today up to a year ahead.`}
          </SectionFooter>
        </section>

        <section>
          <SectionHeader>What for</SectionHeader>
          <div className="flex flex-wrap gap-2 px-4">
            {TRIP_ACTIVITIES.map((activity) => (
              <Chip
                key={activity.id}
                selected={activities.includes(activity.id)}
                onClick={() => toggleActivity(activity.id)}
                title={activity.hint}
              >
                {activity.label}
              </Chip>
            ))}
          </div>
          <SectionFooter>
            {chosenHints.length
              ? chosenHints.map((a) => `${a.label}: ${a.hint.toLowerCase()}`).join(" · ")
              : "Optional. Tells the stylist what the days are for."}
          </SectionFooter>
        </section>

        <section>
          <SectionHeader>Bag</SectionHeader>
          <div className="px-4">
            <SegmentedControl
              value={luggage}
              onValueChange={setPickedLuggage}
              options={LUGGAGE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
              label="Bag"
              className="h-9"
              disabled={creating}
            />
          </div>
          <SectionFooter>
            {bagHint ? `${bagHint}. ` : ""}Up to {CARRY_ON_MAX_NIGHTS} nights fits a carry-on; longer trips get a checked
            bag unless you choose.
          </SectionFooter>
        </section>

        <section>
          <InsetGroup className="mx-4">
            <Row
              title={<label htmlFor="trip-laundry">Laundry on the way</label>}
              trailing={<Switch id="trip-laundry" checked={laundry} onCheckedChange={setLaundry} />}
            />
          </InsetGroup>
          <SectionFooter>Washing halfway means fewer tops to pack.</SectionFooter>
        </section>

        {styles.length ? (
          <section>
            <SectionHeader>Style</SectionHeader>
            <ChipRow className="py-0">
              <Chip selected={styleId === null} onClick={() => setStyleId(null)}>
                Any
              </Chip>
              {styles.map((style) => (
                <Chip key={style.id} selected={styleId === style.id} onClick={() => setStyleId(style.id)}>
                  {style.name}
                </Chip>
              ))}
            </ChipRow>
            <SectionFooter>Optional. Packs the version of you that wears this style.</SectionFooter>
          </section>
        ) : null}

        <section>
          <SectionHeader>Note</SectionHeader>
          <div className="px-4">
            <Textarea
              value={note}
              onChange={(event) => setNote(limitText(event.target.value.replace(/\n/g, " "), MAX_TRIP_STEER_LENGTH))}
              placeholder="Anything special? e.g. a wedding on Saturday"
              rows={2}
              aria-label="Note for the stylist"
              enterKeyHint="done"
              className="min-h-0 resize-none border-0 text-body placeholder:text-label-3"
            />
          </div>
          <NoteCount note={note} className="px-4" />
        </section>
      </fieldset>

      <BottomBar>
        <div className="w-full space-y-2">
          {error ? (
            <p role="alert" className="text-footnote text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            className="w-full disabled:bg-fill-2 disabled:text-label-3 disabled:opacity-100"
            onClick={create}
            disabled={!canPack}
          >
            {creating ? (
              <Loader2 size={18} strokeWidth={2} className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Luggage size={18} strokeWidth={1.75} aria-hidden />
            )}
            {creating ? "Checking the weather…" : "Pack my bag"}
          </Button>
        </div>
      </BottomBar>
    </>
  );
}

type SearchState =
  | { phase: "idle" }
  | { phase: "searching"; places: TripPlace[] | null }
  | { phase: "done"; places: TripPlace[] }
  | { phase: "failed"; message: string; retryable: boolean };

/**
 * Search as you type, a request per pause in typing. Results stay while the
 * next search runs, so the list never flickers. Picking one shows it as the
 * trip's place, with a way to change it.
 */
function PlaceField({ place, onChange }: { place: TripPlace | null; onChange: (place: TripPlace | null) => void }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ phase: "idle" });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();

  useEffect(() => {
    const ticket = ++latest.current;
    if ([...trimmed].length < 2) return;
    const timer = setTimeout(async () => {
      setState((current) => ({
        phase: "searching",
        places: current.phase === "done" ? current.places : current.phase === "searching" ? current.places : null,
      }));
      let result: Awaited<ReturnType<typeof searchTripPlaces>>;
      try {
        result = await searchTripPlaces(trimmed);
      } catch {
        result = { ok: false, retryable: true, error: "Could not reach the place search. Check the connection and try again." };
      }
      if (ticket !== latest.current) return;
      setState(result.ok ? { phase: "done", places: result.places } : { phase: "failed", message: result.error, retryable: result.retryable });
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmed, attempt]);

  if (place) {
    const detail = placeDetail(place);
    return (
      <InsetGroup className="mx-4">
        <Row
          leading={
            <RowIcon>
              <MapPin aria-hidden />
            </RowIcon>
          }
          title={place.name}
          subtitle={detail || undefined}
          trailing={
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setQuery(place.name);
                requestAnimationFrame(() => input.current?.focus());
              }}
              className="-mr-1 flex min-h-11 items-center px-1 text-body text-tint transition-opacity duration-150 active:opacity-60"
            >
              Change
            </button>
          }
        />
      </InsetGroup>
    );
  }

  const short = [...trimmed].length < 2;
  const places = state.phase === "done" || state.phase === "searching" ? state.places : null;

  return (
    <div className="space-y-3">
      <div className="mx-4 flex h-11 items-center gap-2 rounded-xl bg-card px-3">
        <Search size={18} strokeWidth={2} className="shrink-0 text-label-2" aria-hidden />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if ([...event.target.value.trim()].length < 2) setState({ phase: "idle" });
          }}
          placeholder="City or town"
          aria-label="Where to?"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {state.phase === "searching" ? (
          <Loader2 size={16} strokeWidth={2.25} className="shrink-0 animate-spin text-label-2 motion-reduce:animate-none" aria-label="Searching" />
        ) : query ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => {
              setQuery("");
              setState({ phase: "idle" });
              input.current?.focus();
            }}
            className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-label-3 active:opacity-60"
          >
            <X size={16} strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
      </div>

      <div aria-live="polite">
        {short ? (
          <SectionFooter className="mt-0">Type a city or town.</SectionFooter>
        ) : state.phase === "failed" ? (
          <SectionFooter className="mt-0">
            {state.message}{" "}
            {state.retryable ? (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="text-tint">
                Try again
              </button>
            ) : null}
          </SectionFooter>
        ) : places === null ? (
          state.phase === "searching" ? <SectionFooter className="mt-0">Searching…</SectionFooter> : null
        ) : places.length === 0 ? (
          state.phase === "done" ? (
            <SectionFooter className="mt-0">No places match “{trimmed}”.</SectionFooter>
          ) : null
        ) : (
          <InsetGroup className={cn("mx-4 transition-opacity duration-150", state.phase === "searching" && "opacity-60")}>
            {places.map((option) => (
              <Row
                key={`${option.lat},${option.lon},${option.name}`}
                leading={
                  <RowIcon>
                    <MapPin aria-hidden />
                  </RowIcon>
                }
                title={option.name}
                subtitle={placeDetail(option) || undefined}
                onClick={() => onChange(option)}
              />
            ))}
          </InsetGroup>
        )}
      </div>
    </div>
  );
}
