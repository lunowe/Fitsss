"use client";

import { useEffect, useRef } from "react";
import {
  Cloud,
  CloudLightning,
  CloudRain,
  Minus,
  Plus,
  Snowflake,
  Sun,
  Thermometer,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { Chip, ChipRow, InsetGroup, Row, RowIcon, Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WEATHER_CONDITIONS,
  WEATHER_CONDITION_LABELS,
  type WeatherCondition,
  type WeatherSnapshot,
} from "@/domain";

export const CONDITION_ICON: Record<WeatherCondition, LucideIcon> = {
  clear: Sun,
  cloudy: Cloud,
  rain: CloudRain,
  snow: Snowflake,
  wind: Wind,
  storm: CloudLightning,
};

const MIN_TEMP = -30;
const MAX_TEMP = 45;

function clampTemp(value: number): number {
  return Math.min(MAX_TEMP, Math.max(MIN_TEMP, Math.round(value)));
}

/** Where the numbers came from, in one line under the temperature. */
function weatherSubtitle(weather: WeatherSnapshot): string {
  if (weather.source === "manual") return "Set by you";
  return weather.place ?? "Your location";
}

/**
 * A press-and-hold stepper button: one step on tap, then repeats while held.
 * Long-press is what makes setting 8° from 21° bearable on a phone.
 */
function StepButton({
  label,
  icon: Icon,
  onStep,
}: {
  label: string;
  icon: LucideIcon;
  onStep: () => void;
}) {
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({});

  const stop = () => {
    if (timers.current.delay) clearTimeout(timers.current.delay);
    if (timers.current.repeat) clearInterval(timers.current.repeat);
    timers.current = {};
  };

  useEffect(() => stop, []);

  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fill text-label transition-[background-color,transform] duration-150 ease-out active:scale-95 active:bg-fill-2"
      onPointerDown={() => {
        onStep();
        timers.current.delay = setTimeout(() => {
          timers.current.repeat = setInterval(onStep, 100);
        }, 400);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      <Icon size={20} strokeWidth={2} aria-hidden />
    </button>
  );
}

export interface WeatherDraft {
  tempC: number;
  condition: WeatherCondition;
}

/** The draft the sheet opens with, taken from whatever is on screen now. */
export function draftFrom(weather: WeatherSnapshot | null): WeatherDraft {
  return {
    tempC: clampTemp(weather?.tempC ?? 16),
    condition: weather?.condition ?? "cloudy",
  };
}

/**
 * Set today's weather by hand: a big temperature and one condition. The draft
 * lives in the parent, so opening the sheet always starts from today's numbers.
 */
export function WeatherSheet({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: WeatherDraft;
  /** Takes an updater so a held-down stepper never works from a stale value. */
  onDraftChange: (update: (current: WeatherDraft) => WeatherDraft) => void;
  onDone: (weather: WeatherSnapshot) => void;
}) {
  const { tempC, condition } = draft;
  const stepTemp = (delta: number) =>
    onDraftChange((current) => ({ ...current, tempC: clampTemp(current.tempC + delta) }));
  const setCondition = (next: WeatherCondition) =>
    onDraftChange((current) => ({ ...current, condition: next }));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Today's weather"
      description="Used to filter your closet before anything else."
      footer={
        <Button
          className="w-full"
          onClick={() => {
            onDone({ tempC, condition, source: "manual" });
            onOpenChange(false);
          }}
        >
          Done
        </Button>
      }
    >
      <div className="flex items-center justify-center gap-7 py-4">
        <StepButton label="Colder" icon={Minus} onStep={() => stepTemp(-1)} />
        <div
          role="spinbutton"
          aria-label="Temperature in degrees Celsius"
          aria-valuenow={tempC}
          aria-valuemin={MIN_TEMP}
          aria-valuemax={MAX_TEMP}
          className="min-w-[3.5ch] text-center text-[56px] font-bold leading-none tracking-[-1px] tabular-nums text-label"
        >
          {tempC}°
        </div>
        <StepButton label="Warmer" icon={Plus} onStep={() => stepTemp(1)} />
      </div>

      <ChipRow className="px-0 pb-1 pt-2">
        {WEATHER_CONDITIONS.map((id) => {
          const Icon = CONDITION_ICON[id];
          return (
            <Chip
              key={id}
              selected={condition === id}
              onClick={() => setCondition(id)}
              leading={<Icon size={15} strokeWidth={1.75} aria-hidden />}
            >
              {WEATHER_CONDITION_LABELS[id]}
            </Chip>
          );
        })}
      </ChipRow>
    </Sheet>
  );
}

/**
 * The weather line at the top of Today. Three states: still asking the device,
 * a known snapshot, and nothing known yet — which taps straight into the
 * manual sheet so generation is never blocked on a permission prompt.
 */
export function WeatherRow({
  weather,
  loading,
  onEdit,
}: {
  weather: WeatherSnapshot | null;
  loading: boolean;
  onEdit: () => void;
}) {
  if (loading && !weather) {
    return (
      <InsetGroup className="mx-4">
        <div className="flex min-h-11 items-center gap-3 py-2.5 pl-4 pr-4">
          <Skeleton className="size-7 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-3 w-20 rounded-md" />
          </div>
        </div>
      </InsetGroup>
    );
  }

  if (!weather) {
    return (
      <InsetGroup className="mx-4">
        <Row
          leading={
            <RowIcon>
              <Thermometer aria-hidden />
            </RowIcon>
          }
          title="Set your weather"
          subtitle="No location yet"
          trailing={<span className="text-tint">Set</span>}
          onClick={onEdit}
        />
      </InsetGroup>
    );
  }

  const Icon = CONDITION_ICON[weather.condition];

  return (
    <InsetGroup className="mx-4">
      <Row
        leading={
          <RowIcon>
            <Icon aria-hidden />
          </RowIcon>
        }
        title={
          <span className="tabular-nums">
            {Math.round(weather.tempC)}° · {WEATHER_CONDITION_LABELS[weather.condition]}
          </span>
        }
        subtitle={weatherSubtitle(weather)}
        trailing={
          <button
            type="button"
            onClick={onEdit}
            className="-my-2 -mr-2 min-h-11 px-2 text-body text-tint transition-opacity duration-150 active:opacity-60"
          >
            Edit
          </button>
        }
      />
    </InsetGroup>
  );
}
