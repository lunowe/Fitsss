"use client";

import { useState, type ReactNode, type UIEvent } from "react";

import { cn } from "@/lib/utils";

const GAP = 12;

/**
 * Horizontal, scroll-snapped deck of outfit cards. Each card is the content
 * width minus the page gutter, so the next one peeks just enough to invite a
 * swipe. The dots under it are an indicator, not a control.
 */
export function OutfitCarousel({ items }: { items: { id: string; content: ReactNode }[] }) {
  const [index, setIndex] = useState(0);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    const first = track.firstElementChild as HTMLElement | null;
    if (!first) return;
    const step = first.offsetWidth + GAP;
    if (step <= 0) return;
    const next = Math.min(items.length - 1, Math.max(0, Math.round(track.scrollLeft / step)));
    if (next !== index) setIndex(next);
  }

  return (
    <div>
      <div
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <div key={item.id} className="w-[calc(100%-32px)] shrink-0 snap-start">
            {item.content}
          </div>
        ))}
      </div>

      {items.length > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
          {items.map((item, i) => (
            <span
              key={item.id}
              className={cn(
                "size-1.5 rounded-full transition-colors duration-200 ease-out",
                i === index ? "bg-label" : "bg-label-3",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
