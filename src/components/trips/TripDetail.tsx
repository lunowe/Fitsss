"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Ellipsis, Loader2, Luggage, MapPin, RotateCw, X } from "lucide-react";
import { toast } from "sonner";

import { BottomBar, LargeTitleHeader, SectionFooter, SegmentedControl } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { minimumCounts, type Block, type PackingItem, type Trip } from "@/domain";
import { deleteTrip, swapTripPiece, updateTrip } from "@/server/trips";

import { DayPlans, type SwapTarget } from "./DayPlans";
import { readableError } from "./errors";
import { placeLine, tripSubtitle, typicalNote } from "./format";
import { FAILURE_COPY, failureDetail, packTrip, type PackFailure } from "./pack";
import type { StyleOption } from "./PlanTripForm";
import { Suitcase } from "./Suitcase";
import {
  CountSheet,
  DeleteTripSheet,
  EditTripSheet,
  RepackOfferSheet,
  RepackSheet,
  SwapSheet,
  TripActionsSheet,
  type SwapRequest,
  type TripEdit,
} from "./TripSheets";
import { WeatherStrip } from "./WeatherStrip";

type Mode = "suitcase" | "days";
type SheetName = "actions" | "edit" | "repack" | "repack-offer" | "delete";

/** Honest stages: the weather and the closet are quick; planning the days is the long part, so the last one holds. */
const STAGES = ["Checking the weather for every day", "Reading your closet", "Packing the bag and planning each day"];
const STAGE_MS = 1500;
const LONG_WAIT_MS = 12_000;
/** While another tab (or an earlier visit) packs this trip, look again this often. */
const POLL_MS = 3000;

/** The later of two copies of the trip: an action's answer and a server render can cross. */
function newer(a: Trip, b: Trip): Trip {
  return b.updatedAt > a.updatedAt ? b : a;
}

/**
 * One trip: where and when, the weather for every day, then either the
 * suitcase (ticked off as you go) or the days (an outfit each, any piece
 * swappable). Unpacked, the page packs it: on arrival from "Plan a trip", or
 * from the pinned button. Packing runs alongside everything else; while it
 * runs, ticks still work and the rest waits.
 */
export function TripDetail({
  trip: served,
  packingOnServer,
  packOnArrival,
  blocks,
  styles,
  back,
}: {
  trip: Trip;
  /** Being packed right now (from another tab, or before this page loaded). */
  packingOnServer: boolean;
  /** Just planned: pack it as soon as the page shows. */
  packOnArrival: boolean;
  /** Every piece, archived ones included, so a day still draws what has left the closet. */
  blocks: Block[];
  styles: StyleOption[];
  back: ReactNode;
}) {
  const router = useRouter();

  const [trip, setTrip] = useState(served);
  const [seen, setSeen] = useState(served);
  if (served !== seen) {
    setSeen(served);
    setTrip((current) => newer(current, served));
  }

  /** When this page's own packing started; null when it isn't packing. Just planned, it starts at once. */
  const [packingSince, setPackingSince] = useState<number | null>(() =>
    packOnArrival && !served.plan ? Date.now() : null,
  );
  const [failure, setFailure] = useState<PackFailure | null>(null);
  const [mode, setMode] = useState<Mode>("suitcase");
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [swapping, setSwapping] = useState<SwapTarget | null>(null);
  const [counting, setCounting] = useState<PackingItem | null>(null);
  /** Ticks sent and not yet answered, drawn over the stored ones. */
  const [ticks, setTicks] = useState<ReadonlyMap<string, boolean>>(new Map());
  const tickSeq = useRef(new Map<string, number>());
  const packStarted = useRef(false);

  const packing = packingSince !== null || packingOnServer;

  const byId = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const closet = useMemo(() => blocks.filter((block) => !block.archivedAt), [blocks]);

  /** The trip as drawn: pending ticks over the stored ones. */
  const shown = useMemo<Trip>(() => {
    if (!trip.plan || ticks.size === 0) return trip;
    return {
      ...trip,
      plan: {
        ...trip.plan,
        packing: trip.plan.packing.map((item) =>
          ticks.has(item.blockId) ? { ...item, packed: ticks.get(item.blockId)! } : item,
        ),
      },
    };
  }, [trip, ticks]);

  /* ---------------------------------------------------------------- */
  /* Packing                                                           */
  /* ---------------------------------------------------------------- */

  function pack(steer?: string) {
    if (packingSince !== null || packingOnServer) return;
    setFailure(null);
    setPackingSince(Date.now());
    // The progress card sits at the top; packing again is often started from far down the suitcase.
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    void runPack(steer);
  }

  /** The request itself; `packingSince` is already set. */
  async function runPack(steer?: string) {
    const outcome = await packTrip(trip.id, steer);
    setPackingSince(null);
    if (outcome.ok) {
      setTrip((current) => newer(current, outcome.trip));
      toast(trip.plan ? "Packed again" : "Packed");
    } else if (outcome.failure.kind === "gone") {
      toast(outcome.failure.message);
      router.push("/looks?tab=trips");
      return;
    } else {
      setFailure(outcome.failure);
    }
    router.refresh();
  }

  // Just planned: pack once, and take `?pack=1` off the address so a reload doesn't pack again.
  useEffect(() => {
    if (!packOnArrival || packStarted.current) return;
    packStarted.current = true;
    router.replace(`/trips/${served.id}`, { scroll: false });
    if (!served.plan) void runPack();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival
  }, [packOnArrival]);

  // Packed elsewhere: look again until it is done.
  useEffect(() => {
    if (!packingOnServer || packingSince !== null) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [packingOnServer, packingSince, router]);

  /* ---------------------------------------------------------------- */
  /* Edits                                                             */
  /* ---------------------------------------------------------------- */

  function toggle(item: PackingItem) {
    const next = !(ticks.get(item.blockId) ?? item.packed);
    const seq = (tickSeq.current.get(item.blockId) ?? 0) + 1;
    tickSeq.current.set(item.blockId, seq);
    setTicks((current) => new Map(current).set(item.blockId, next));

    void (async () => {
      let ok = false;
      try {
        const result = await updateTrip(trip.id, { packed: { [item.blockId]: next } });
        if (result.ok) {
          ok = true;
          setTrip((current) => newer(current, result.trip));
        }
      } catch {
        // Reported below.
      }
      // Only the latest tick of a piece clears its overlay.
      if (tickSeq.current.get(item.blockId) === seq) {
        setTicks((current) => {
          const map = new Map(current);
          map.delete(item.blockId);
          return map;
        });
      }
      if (!ok) toast("Couldn’t save that tick");
    })();
  }

  /** Runs a write; answers the server's sentence when it refuses, null when stored. */
  async function write(run: () => Promise<Awaited<ReturnType<typeof updateTrip>>>, fallback: string): Promise<string | null> {
    try {
      const result = await run();
      if (result.ok) {
        setTrip((current) => newer(current, result.trip));
        return null;
      }
      if (result.code === "not-found") {
        toast(result.error);
        router.push("/looks?tab=trips");
        return null;
      }
      return readableError(result.errors?.[0] ?? result.error);
    } catch {
      return fallback;
    }
  }

  async function setCount(item: PackingItem, count: number): Promise<string | null> {
    const refused = await write(() => updateTrip(trip.id, { counts: { [item.blockId]: count } }), "Couldn’t change that.");
    if (!refused) {
      setCounting(null);
      if (count === 0) toast("Taken out of the bag");
    }
    return refused;
  }

  async function swap(target: SwapTarget, request: SwapRequest): Promise<string | null> {
    const from = target.entry.slot === "accessories" ? target.entry.blockId : undefined;
    const input =
      request.kind === "separates"
        ? { date: target.date, slot: "separates", top: request.top, bottom: request.bottom }
        : { date: target.date, slot: target.entry.slot, toBlockId: request.kind === "take-off" ? null : request.toBlockId, fromBlockId: from };
    const refused = await write(() => swapTripPiece(trip.id, input), "Couldn’t swap that piece.");
    if (!refused) setSwapping(null);
    return refused;
  }

  async function edit(patch: TripEdit, affectsPlan: boolean): Promise<string | null> {
    const refused = await write(() => updateTrip(trip.id, patch), "Couldn’t save this trip.");
    if (!refused) {
      toast("Saved");
      setSheet(affectsPlan && trip.plan ? "repack-offer" : null);
    }
    return refused;
  }

  async function remove() {
    try {
      const result = await deleteTrip(trip.id);
      if (!result.ok) toast(result.error);
      else toast("Trip deleted");
      setSheet(null);
      router.push("/looks?tab=trips");
    } catch {
      toast("Could not delete this trip");
    }
  }

  /* ---------------------------------------------------------------- */
  /* Page                                                              */
  /* ---------------------------------------------------------------- */

  const plan = shown.plan;
  const note = typicalNote(trip.weather);
  const countingBlock = counting ? byId.get(counting.blockId) : undefined;
  const floor =
    counting && plan
      ? (minimumCounts(plan.days, new Map(closet.map((b) => [b.id, b])), trip.options.laundry).get(counting.blockId) ?? 0)
      : 0;

  return (
    <>
      <LargeTitleHeader
        leading={back}
        title={trip.name}
        subtitle={tripSubtitle(trip)}
        trailing={
          <button
            type="button"
            aria-label="Trip actions"
            disabled={packing}
            onClick={() => setSheet("actions")}
            className="-mr-2 flex size-11 items-center justify-center text-tint transition-opacity active:opacity-60 disabled:opacity-30"
          >
            <Ellipsis size={24} strokeWidth={2} aria-hidden />
          </button>
        }
      />

      <div className="space-y-6 pt-2">
        <section>
          <p className="mb-2 flex items-center gap-1.5 px-4 text-footnote text-label-2">
            <MapPin size={14} strokeWidth={2} aria-hidden />
            {placeLine(trip.place)}
          </p>
          {trip.weather.length ? (
            <div className="mx-4 overflow-hidden rounded-xl bg-card px-2 py-1.5">
              <WeatherStrip days={trip.weather} />
            </div>
          ) : null}
          {note ? <SectionFooter>{note}</SectionFooter> : null}
        </section>

        {packing ? (
          <PackingCard since={packingSince} again={Boolean(trip.plan)} />
        ) : failure ? (
          <FailureCard failure={failure} canRetry={Boolean(trip.plan)} onRetry={() => pack()} onDismiss={() => setFailure(null)} />
        ) : !trip.plan ? (
          <div className="mx-4 rounded-xl bg-card px-4 py-3">
            <p className="text-headline text-label">Not packed yet</p>
            <p className="mt-0.5 text-subhead text-label-2">
              Fitsss packs a bag from your closet for these days, with an outfit for each.
            </p>
          </div>
        ) : null}

        {plan ? (
          <>
            <div className="px-4">
              <SegmentedControl
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: "suitcase", label: "Suitcase" },
                  { value: "days", label: "Days" },
                ]}
                label="Suitcase or days"
                className="h-9"
              />
            </div>
            {mode === "suitcase" ? (
              <Suitcase
                trip={shown}
                plan={plan}
                byId={byId}
                locked={packing}
                onToggle={toggle}
                onCount={(item) => setCounting(item)}
              />
            ) : (
              <DayPlans
                plan={plan}
                weather={trip.weather}
                blocks={blocks}
                byId={byId}
                locked={packing}
                onSwap={setSwapping}
              />
            )}
          </>
        ) : null}
      </div>

      {!plan && !packing ? (
        <BottomBar>
          <Button className="w-full" onClick={() => pack()}>
            {failure ? (
              <RotateCw size={18} strokeWidth={1.75} aria-hidden />
            ) : (
              <Luggage size={18} strokeWidth={1.75} aria-hidden />
            )}
            {failure ? "Try again" : "Pack my bag"}
          </Button>
        </BottomBar>
      ) : null}

      <TripActionsSheet
        open={sheet === "actions"}
        onOpenChange={(open) => setSheet(open ? "actions" : null)}
        trip={trip}
        onRepack={() => setSheet("repack")}
        onEdit={() => setSheet("edit")}
        onDelete={() => setSheet("delete")}
      />
      <EditTripSheet open={sheet === "edit"} trip={trip} styles={styles} onClose={() => setSheet(null)} onSave={edit} />
      <RepackSheet open={sheet === "repack"} trip={trip} onClose={() => setSheet(null)} onPack={(steer) => pack(steer)} />
      <RepackOfferSheet open={sheet === "repack-offer"} onClose={() => setSheet(null)} onPack={() => pack()} />
      <DeleteTripSheet open={sheet === "delete"} trip={trip} onClose={() => setSheet(null)} onDelete={remove} />
      <SwapSheet target={swapping} closet={closet} onClose={() => setSwapping(null)} onSwap={swap} />
      <CountSheet
        item={counting}
        block={countingBlock}
        floor={floor}
        onClose={() => setCounting(null)}
        onSave={setCount}
      />
    </>
  );
}

/**
 * While the server packs: an honest, staged line, and a second one once the
 * wait gets long. No percentage: there is none to show.
 */
function PackingCard({ since, again }: { since: number | null; again: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = since ?? Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(timer);
  }, [since]);
  const stage = Math.min(STAGES.length - 1, Math.max(0, Math.floor(elapsed / STAGE_MS)));

  return (
    <div className="mx-4 flex items-start gap-3 rounded-xl bg-card px-4 py-3" role="status">
      <Loader2 size={20} strokeWidth={2} className="mt-0.5 shrink-0 animate-spin text-label-2 motion-reduce:animate-none" aria-hidden />
      <div className="min-w-0">
        <p className="text-headline text-label">{again ? "Packing again" : "Packing your bag"}</p>
        <p className="mt-0.5 text-subhead text-label-2">{STAGES[stage]}…</p>
        {elapsed >= LONG_WAIT_MS ? (
          <p className="mt-1 text-footnote text-label-2">A good plan takes a moment. This can take up to a minute.</p>
        ) : null}
      </div>
    </div>
  );
}

function FailureCard({
  failure,
  canRetry,
  onRetry,
  onDismiss,
}: {
  failure: PackFailure;
  /** Packed before: there is no pinned button, so the card offers the retry. */
  canRetry: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { title, icon: Icon } = FAILURE_COPY[failure.kind];
  return (
    <div className="mx-4 overflow-hidden rounded-xl bg-card" role="alert">
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-label" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-headline text-label">{title}</p>
          <p className="mt-0.5 text-subhead text-label-2">{failureDetail(failure)}</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-mr-2 -mt-1.5 flex size-9 shrink-0 items-center justify-center text-label-3 active:opacity-60"
        >
          <X size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
      {failure.kind === "closet" ? (
        <FailureLink href="/closet/add">Add pieces</FailureLink>
      ) : failure.kind === "not-configured" ? (
        <FailureLink href="/you/model">AI model settings</FailureLink>
      ) : canRetry ? (
        <div className="border-t border-separator pl-4">
          <button type="button" onClick={onRetry} className="flex min-h-11 w-full items-center text-body text-tint active:opacity-60">
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FailureLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="border-t border-separator pl-4">
      <Link href={href} className="flex min-h-11 items-center text-body text-tint active:opacity-60">
        {children}
      </Link>
    </div>
  );
}
