"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { BottomBar, InsetGroup, Row, RowIcon } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Block, GenerationResult, Outfit } from "@/domain";
import { generateOutfits } from "@/server/generate";
import { getWeather } from "@/server/weather";

import { OutfitCarousel } from "./OutfitCarousel";
import { PinnedRow, type PinnedBlock } from "./PinnedRow";
import { SteeringBlock, type StyleOption } from "./SteeringBlock";
import { EMPTY_CARD_STATE, TodayOutfitCard, type OutfitCardState } from "./TodayOutfitCard";
import { WeatherRow, WeatherSheet, draftFrom, type WeatherDraft } from "./WeatherRow";
import {
  DEFAULT_PREFS,
  getPrefs,
  getServerPrefs,
  getServerWeatherSnapshot,
  getWeatherSnapshot,
  setCachedWeather,
  setPrefs,
  subscribePrefs,
  subscribeWeather,
  type TodayPrefs,
} from "./prefs";

/** Honest, in order: this is what the server is actually doing. */
const STAGES = ["Reading your closet", "Checking the weather", "Composing looks"];

const GEOLOCATION_TIMEOUT_MS = 8000;
const GEOLOCATION_MAX_AGE_MS = 30 * 60 * 1000;

/** Never rejects: a refused or timed-out prompt is just "no position". */
function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS },
    );
  });
}

function CardSkeleton() {
  return (
    <div className="w-[calc(100%-32px)] shrink-0 rounded-xl bg-card p-3">
      <Skeleton className="aspect-square w-full rounded-[10px]" />
      <div className="space-y-2 px-1 pt-3">
        <Skeleton className="h-5 w-2/5 rounded-md" />
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-3/4 rounded-md" />
      </div>
      <Skeleton className="mt-3 h-[52px] w-full rounded-xl" />
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Today: weather, three dials, one button. Everything the user touches lives
 * here; the page above it only fetches. The last generation comes in as a prop
 * so the screen is never empty on a return visit, and its request is what the
 * steering controls show.
 */
export function TodayScreen({
  blocks,
  styles,
  latest,
  pinnedBlock = null,
  tasteSummary = null,
}: {
  blocks: Block[];
  styles: StyleOption[];
  latest: GenerationResult | null;
  /** Piece to build every outfit around, from `?pin=` on the URL. */
  pinnedBlock?: PinnedBlock | null;
  /** How much of the user's taste is behind these outfits. */
  tasteSummary?: { events: number; lines: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /* The pin comes from the URL and nowhere else: a restored generation never
     resurrects one the user cannot see. */
  const [pinned, setPinned] = useState<PinnedBlock | null>(pinnedBlock);
  const [pinSource, setPinSource] = useState(pinnedBlock);
  if (pinSource !== pinnedBlock) {
    setPinSource(pinnedBlock);
    setPinned(pinnedBlock);
  }

  /* Steering: what the user just picked, else the last generation, else the
     device's remembered choice, else the defaults. */
  const storedPrefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs);
  const [picked, setPicked] = useState<TodayPrefs | null>(null);
  const fromLatest: TodayPrefs | null = latest
    ? { styleId: latest.request.styleId ?? null, occasion: latest.request.occasion }
    : null;
  const prefs = picked ?? fromLatest ?? storedPrefs ?? DEFAULT_PREFS;
  const styleId = prefs.styleId && styles.some((style) => style.id === prefs.styleId) ? prefs.styleId : null;
  const occasion = prefs.occasion;

  const [steer, setSteer] = useState(latest?.request.steer ?? "");

  const weather = useSyncExternalStore(subscribeWeather, getWeatherSnapshot, getServerWeatherSnapshot);
  const [locating, setLocating] = useState(true);
  const [weatherSheetOpen, setWeatherSheetOpen] = useState(false);
  const [draft, setDraft] = useState<WeatherDraft>(() => draftFrom(null));

  const [result, setResult] = useState<GenerationResult | null>(latest);
  const [cards, setCards] = useState<Record<string, OutfitCardState>>({});
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [stage, setStage] = useState(0);

  const resultsRef = useRef<HTMLDivElement>(null);

  /* Weather: the cache answers first; only an empty cache asks the device. */
  useEffect(() => {
    if (weather ?? getWeatherSnapshot()) return;
    let cancelled = false;

    void (async () => {
      const position = await currentPosition();
      const forecast = position
        ? await getWeather({ lat: position.coords.latitude, lon: position.coords.longitude })
        : null;
      if (cancelled) return;
      if (forecast?.ok) setCachedWeather(forecast.weather);
      setLocating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [weather]);

  /* The status line only advances while the server is actually working. */
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 1100);
    return () => clearInterval(timer);
  }, [pending]);

  function choose(next: TodayPrefs) {
    setPicked(next);
    setPrefs(next);
  }

  function openWeatherSheet() {
    setDraft(draftFrom(weather));
    setWeatherSheetOpen(true);
  }

  // A function declaration, so the Retry action below can call it by name.
  function generate() {
    if (!weather) {
      // Generation is never blocked on a permission prompt: set it by hand.
      openWeatherSheet();
      return;
    }
    setError(null);
    setStage(0);

    startTransition(async () => {
      const response = await generateOutfits({
        styleId: styleId ?? undefined,
        occasion,
        weather,
        steer: steer.trim() || undefined,
        count: 3,
        pinned: pinned ? [pinned.id] : [],
        excluded: [],
      });

      if (!response.ok) {
        if (response.code === "llm") {
          toast(response.error, { action: { label: "Retry", onClick: () => generate() } });
          return;
        }
        setError({ code: response.code, message: response.error });
        return;
      }

      setResult(response.result);
      setCards({});
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start",
        });
      }, 60);
    });
  }

  function replaceOutfit(next: Outfit) {
    setResult((current) =>
      current
        ? { ...current, outfits: current.outfits.map((o) => (o.id === next.id ? next : o)) }
        : current,
    );
  }

  const outfits = result?.outfits ?? [];
  // Only worth saying once there is something behind it.
  const showTaste = Boolean(tasteSummary && (tasteSummary.lines >= 1 || tasteSummary.events >= 3));

  return (
    <>
      <div className="space-y-6 pt-2">
        <WeatherRow weather={weather} loading={locating} onEdit={openWeatherSheet} />

        {pinned ? (
          <PinnedRow
            block={pinned}
            onRemove={() => {
              setPinned(null);
              router.replace("/today");
            }}
          />
        ) : null}

        <SteeringBlock
          styles={styles}
          styleId={styleId}
          onStyleChange={(next) => choose({ styleId: next, occasion })}
          occasion={occasion}
          onOccasionChange={(next) => choose({ styleId, occasion: next })}
          steer={steer}
          onSteerChange={setSteer}
        />

        {blocks.length ? (
          <div className="px-4">
            <InsetGroup>
              <Row
                leading={
                  <RowIcon>
                    <ImageIcon aria-hidden />
                  </RowIcon>
                }
                title="Restyle a picture"
                href="/inspo/new"
              />
            </InsetGroup>
          </div>
        ) : null}

        <div ref={resultsRef} className="scroll-mt-[calc(env(safe-area-inset-top)+52px)] pt-2">
          {pending ? (
            <>
              <p className="px-4 text-footnote text-label-2" aria-live="polite">
                {STAGES[stage]}…
              </p>
              <div className="mt-2 flex gap-3 overflow-hidden px-4">
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </div>
            </>
          ) : error ? (
            <div className="px-4">
              <InsetGroup>
                <div className="px-4 py-3 text-subhead text-label-2">
                  {error.code === "not-configured"
                    ? "Add ANTHROPIC_API_KEY to .env.local and restart the server."
                    : error.message}
                </div>
                {error.code === "too-few-pieces" || error.code === "empty-closet" ? (
                  <Row title="Add pieces" href="/closet/add" />
                ) : null}
              </InsetGroup>
            </div>
          ) : outfits.length && result ? (
            <>
              <OutfitCarousel
                key={result.id}
                items={outfits.map((outfit) => ({
                  id: outfit.id,
                  content: (
                    <TodayOutfitCard
                      outfit={outfit}
                      blocks={blocks}
                      generationId={result.id}
                      styleId={result.request.styleId}
                      occasion={result.request.occasion}
                      weather={result.request.weather}
                      state={cards[outfit.id] ?? EMPTY_CARD_STATE}
                      onStateChange={(next) =>
                        setCards((current) => ({ ...current, [outfit.id]: next }))
                      }
                      onOutfitChange={replaceOutfit}
                    />
                  ),
                }))}
              />

              <div className="mt-5 px-4">
                <Button variant="secondary" className="w-full" onClick={generate} disabled={pending}>
                  Try again
                </Button>
                {result.filteredOutCount > 0 ? (
                  <p className="mt-2 text-center text-footnote text-label-2">
                    Left out {result.filteredOutCount}{" "}
                    {result.filteredOutCount === 1 ? "piece" : "pieces"} that don’t fit the weather
                  </p>
                ) : null}
                {showTaste ? (
                  <p className="mt-2 text-center text-footnote text-label-2">
                    <Link href="/you/taste" className="text-tint">
                      Shaped by {tasteSummary?.events} of your choices
                    </Link>
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="px-8 py-10 text-center text-footnote text-label-2">
              Three outfits from what you own, for today.
            </p>
          )}
        </div>
      </div>

      <BottomBar>
        <Button className="w-full" onClick={generate} disabled={pending}>
          {pending ? (
            <Loader2
              size={18}
              strokeWidth={2}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Sparkles size={18} strokeWidth={1.75} aria-hidden />
          )}
          {pending ? "Styling…" : "Style me"}
        </Button>
      </BottomBar>

      <WeatherSheet
        open={weatherSheetOpen}
        onOpenChange={setWeatherSheetOpen}
        draft={draft}
        onDraftChange={setDraft}
        onDone={(next) => {
          setCachedWeather(next);
          setLocating(false);
        }}
      />
    </>
  );
}
