"use client";

import { cn } from "@/lib/utils";

/**
 * A wall date (YYYY-MM-DD) as the platform's own date picker: the wheel on
 * iOS, a calendar elsewhere. Sits in a Row's trailing slot.
 */
export function DateField({
  label,
  value,
  min,
  max,
  onChange,
  onCommit,
  className,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  /** Every edit, partial ones included (typing a year passes through 0002). */
  onChange: (value: string) => void;
  /** When the field is left: the value is final, the place to correct it. */
  onCommit?: () => void;
  className?: string;
}) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      required
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      className={cn(
        "h-9 min-w-0 rounded-lg bg-fill px-2.5 text-right text-body tabular-nums text-label outline-none [color-scheme:light_dark] focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  );
}
