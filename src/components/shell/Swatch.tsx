"use client";

import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { isLightHex } from "@/domain/colors";
import { cn } from "@/lib/utils";

/**
 * Circular color swatch. Very light colors get a hairline ring so they read on
 * white cards. Selected state: 2px tint ring with a 2px gap and a check mark.
 */
export function Swatch({
  hex,
  secondaryHex,
  size = 36,
  selected = false,
  label,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  hex: string;
  secondaryHex?: string;
  size?: number;
  selected?: boolean;
  /** Accessible name, e.g. the color name. */
  label: string;
}) {
  const light = isLightHex(hex);
  const background = secondaryHex
    ? `linear-gradient(135deg, ${hex} 0 50%, ${secondaryHex} 50% 100%)`
    : hex;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full transition-transform duration-150 active:scale-95",
        light && "ring-1 ring-inset ring-separator",
        selected && "outline outline-2 outline-offset-2 outline-tint",
        className,
      )}
      style={{ width: size, height: size, background }}
      {...props}
    >
      {selected ? (
        <Check size={Math.round(size * 0.5)} strokeWidth={2.5} color={light ? "#000000" : "#ffffff"} aria-hidden />
      ) : null}
    </button>
  );
}

/** Non-interactive swatch dot for captions and rows. */
export function SwatchDot({ hex, secondaryHex, size = 12, className }: { hex: string; secondaryHex?: string; size?: number; className?: string }) {
  const background = secondaryHex ? `linear-gradient(135deg, ${hex} 0 50%, ${secondaryHex} 50% 100%)` : hex;
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", isLightHex(hex) && "ring-1 ring-inset ring-separator", className)}
      style={{ width: size, height: size, background }}
    />
  );
}
