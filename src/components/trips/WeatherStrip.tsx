import { Fragment } from "react";

import { CONDITION_ICON } from "@/components/today/conditions";
import { WEATHER_CONDITION_LABELS, type TripDayWeather } from "@/domain";
import { cn } from "@/lib/utils";

import { dayTitleLong, degrees, monthAndDay, weekday } from "./format";

/** Up to a week fits the width; longer trips scroll sideways. */
const FITS = 7;

/**
 * One column a day: weekday and date, the condition, the high over the low.
 * Days beyond the forecast show what is typical for the date instead: drawn
 * quieter, the high with a tilde, a dashed line where the forecast ends.
 */
export function WeatherStrip({ days }: { days: TripDayWeather[] }) {
  const firstTypical = days.findIndex((day) => day.source === "typical");
  const scrolls = days.length > FITS;

  return (
    <div
      role="list"
      aria-label="Weather by day"
      className={cn(
        "flex",
        scrolls && "-mx-2 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {days.map((day, index) => (
        <Fragment key={day.date}>
          {index === firstTypical && index > 0 ? (
            <span aria-hidden className="my-2 w-0 shrink-0 border-l border-dashed border-separator" />
          ) : null}
          <DayColumn day={day} fixed={scrolls} />
        </Fragment>
      ))}
    </div>
  );
}

function DayColumn({ day, fixed }: { day: TripDayWeather; fixed: boolean }) {
  const typical = day.source === "typical";
  const Icon = CONDITION_ICON[day.condition];
  const label = [
    `${dayTitleLong(day.date)}: ${WEATHER_CONDITION_LABELS[day.condition]}, high ${degrees(day.tempC)}`,
    day.lowC !== undefined ? `low ${degrees(day.lowC)}` : null,
    typical ? "typical for the date, not a forecast" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      role="listitem"
      aria-label={label}
      className={cn(
        "flex flex-col items-center gap-[3px] py-1.5 whitespace-nowrap",
        fixed ? "w-[42px] shrink-0" : "min-w-0 flex-1",
      )}
    >
      <span
        className={cn(
          "text-[11px] font-semibold uppercase leading-[13px] tracking-[0.3px]",
          typical ? "text-label-3" : "text-label-2",
        )}
      >
        {weekday(day.date)}
      </span>
      <span className={cn("text-footnote tabular-nums", typical ? "text-label-2" : "text-label")}>
        {monthAndDay(day.date).day}
      </span>
      <span className="flex h-7 items-center">
        <Icon size={20} strokeWidth={1.75} className={typical ? "text-label-3" : "text-label"} aria-hidden />
      </span>
      <span className={cn("text-subhead font-semibold tabular-nums", typical ? "text-label-2" : "text-label")}>
        {typical ? "~" : ""}
        {degrees(day.tempC)}
      </span>
      {day.lowC !== undefined ? (
        <span className={cn("text-caption tabular-nums", typical ? "text-label-3" : "text-label-2")}>
          {degrees(day.lowC)}
        </span>
      ) : null}
    </div>
  );
}
