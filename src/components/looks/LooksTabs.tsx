"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

import { LargeTitleHeader, SegmentedControl } from "@/components/shell";

type Tab = "saved" | "inspo";

const OPTIONS = [
  { value: "saved" as const, label: "Saved" },
  { value: "inspo" as const, label: "Inspo" },
];

/**
 * Looks has two shelves: the outfits you kept, and the pictures you brought.
 * Both halves are rendered on the server and handed in, so switching costs
 * nothing.
 */
export function LooksTabs({
  savedCount,
  inspoCount,
  saved,
  inspo,
}: {
  savedCount: number;
  inspoCount: number;
  saved: ReactNode;
  inspo: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("saved");

  const subtitle =
    tab === "saved"
      ? savedCount === 0
        ? "Nothing saved yet"
        : `${savedCount} saved`
      : `${inspoCount} ${inspoCount === 1 ? "picture" : "pictures"}`;

  return (
    <>
      <LargeTitleHeader
        title="Looks"
        subtitle={subtitle}
        trailing={
          tab === "inspo" ? (
            <Link
              href="/inspo/new"
              aria-label="Add a picture"
              className="-mr-2 flex size-11 items-center justify-center text-tint active:opacity-60"
            >
              <Plus size={24} strokeWidth={2} aria-hidden />
            </Link>
          ) : null
        }
      >
        <div className="px-4 pb-2 pt-1">
          <SegmentedControl value={tab} onValueChange={setTab} options={OPTIONS} label="Looks or inspo" />
        </div>
      </LargeTitleHeader>

      {tab === "saved" ? saved : inspo}
    </>
  );
}
