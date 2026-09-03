"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
};

/**
 * iOS-style segmented control: `bg-fill` track with a sliding `bg-card` thumb.
 * Sized for a Row trailing slot; pass `className` to stretch it.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Accessible name for the group. */
  label?: string;
  className?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const count = Math.max(options.length, 1);

  function move(delta: number) {
    const next = options[(index + delta + count) % count];
    if (next) onValueChange(next.value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("relative flex h-8 select-none rounded-[9px] bg-fill p-0.5", className)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[7px] bg-card shadow-[0_1px_3px_rgb(0_0_0/0.12)] transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: `calc((100% - 4px) / ${count})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "relative z-10 min-w-0 flex-1 truncate rounded-[7px] px-3 text-footnote transition-colors duration-150 ease-out",
              selected ? "font-semibold text-label" : "font-medium text-label-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
