"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

import { LargeTitleHeader, SegmentedControl } from "@/components/shell";

export type LooksTab = "saved" | "inspo" | "trips";

const OPTIONS = [
  { value: "saved" as const, label: "Saved" },
  { value: "inspo" as const, label: "Inspo" },
  { value: "trips" as const, label: "Trips" },
];

/** Where each shelf's "+" goes, and what it is called. */
const ADD: Partial<Record<LooksTab, { href: string; label: string }>> = {
  inspo: { href: "/inspo/new", label: "Add a picture" },
  trips: { href: "/trips/new", label: "Plan a trip" },
};

/**
 * Looks has three shelves: the outfits you kept, the pictures you brought,
 * and the trips you packed for. All are rendered on the server and handed in,
 * so switching costs nothing. The shelf shown is in the URL (`?tab=trips`), so
 * other screens can link to it and Back returns to it.
 */
export function LooksTabs({
  initialTab = "saved",
  savedCount,
  inspoCount,
  tripsSubtitle,
  saved,
  inspo,
  trips,
}: {
  initialTab?: LooksTab;
  savedCount: number;
  inspoCount: number;
  tripsSubtitle: string;
  saved: ReactNode;
  inspo: ReactNode;
  trips: ReactNode;
}) {
  const [tab, setTab] = useState<LooksTab>(initialTab);
  // A link to another shelf while Looks is already showing (`?tab=trips`).
  const [linked, setLinked] = useState(initialTab);
  if (linked !== initialTab) {
    setLinked(initialTab);
    setTab(initialTab);
  }

  function choose(next: LooksTab) {
    setTab(next);
    // The native history API keeps Next's router in step without a round trip.
    window.history.replaceState(null, "", next === "saved" ? "/looks" : `/looks?tab=${next}`);
  }

  const subtitle =
    tab === "saved"
      ? savedCount === 0
        ? "Nothing saved yet"
        : `${savedCount} saved`
      : tab === "inspo"
        ? `${inspoCount} ${inspoCount === 1 ? "picture" : "pictures"}`
        : tripsSubtitle;

  const add = ADD[tab];

  return (
    <>
      <LargeTitleHeader
        title="Looks"
        subtitle={subtitle}
        trailing={
          add ? (
            <Link
              href={add.href}
              aria-label={add.label}
              className="-mr-2 flex size-11 items-center justify-center text-tint active:opacity-60"
            >
              <Plus size={24} strokeWidth={2} aria-hidden />
            </Link>
          ) : null
        }
      >
        <div className="px-4 pb-2 pt-1">
          <SegmentedControl value={tab} onValueChange={choose} options={OPTIONS} label="Saved looks, inspo or trips" />
        </div>
      </LargeTitleHeader>

      {tab === "saved" ? saved : tab === "inspo" ? inspo : trips}
    </>
  );
}
