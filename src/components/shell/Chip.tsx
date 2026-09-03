"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 34px pill toggle. Selected chips are ink-filled. */
export function Chip({
  selected = false,
  leading,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { selected?: boolean; leading?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-subhead font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:opacity-40",
        selected ? "bg-ink text-ink-fg" : "bg-fill text-label",
        className,
      )}
      {...props}
    >
      {leading}
      {children}
    </button>
  );
}

/** Horizontally scrolling chip row with edge padding and hidden scrollbar. */
export function ChipRow({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}
