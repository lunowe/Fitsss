import type { Metadata } from "next";
import Link from "next/link";
import { Sun } from "lucide-react";

import { EmptyState, LargeTitleHeader, Screen } from "@/components/shell";
import { TodayScreen } from "@/components/today/TodayScreen";
import { Button } from "@/components/ui/button";
import { listBlocks } from "@/server/blocks-queries";
import { getLatestGeneration } from "@/server/generations-queries";
import { listStyles } from "@/server/styles-queries";
import { getTasteProfile } from "@/server/taste-queries";

export const metadata: Metadata = {
  title: "Today",
};

type Props = { searchParams: Promise<{ pin?: string | string[] }> };

/** "Tuesday, 2 September" — formatted on the server so the date never flickers. */
function dateInWords(now: Date): string {
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const day = now.toLocaleDateString("en-GB", { day: "numeric" });
  const month = now.toLocaleDateString("en-GB", { month: "long" });
  return `${weekday}, ${day} ${month}`;
}

export default async function TodayPage({ searchParams }: Props) {
  const { pin } = await searchParams;
  const [blocks, styles, latest] = await Promise.all([
    listBlocks(),
    listStyles(),
    getLatestGeneration(),
  ]);

  // A pin is only honoured when it is a piece the user still owns.
  const pinId = Array.isArray(pin) ? pin[0] : pin;
  const pinnedBlock = pinId ? (blocks.find((block) => block.id === pinId) ?? null) : null;

  // One query, for the footnote under the results.
  const taste = await getTasteProfile(latest?.request.styleId ?? null);

  // Nothing can be generated without shoes and either a top and a bottom or a
  // full-body piece — the same floor the generator enforces.
  const has = (category: string) => blocks.some((block) => block.category === category);
  const wearable = has("footwear") && ((has("top") && has("bottom")) || has("fullbody"));

  return (
    <Screen hasBottomBar={wearable}>
      <LargeTitleHeader title="Today" subtitle={dateInWords(new Date())} />

      {wearable ? (
        <TodayScreen
          blocks={blocks}
          styles={styles.map((style) => ({ id: style.id, name: style.name }))}
          latest={latest}
          pinnedBlock={pinnedBlock}
          tasteSummary={{
            // Every event in scope shapes the prompt, not just the ones the
            // last refresh happened to read.
            events: taste.totalEvents,
            lines: taste.lines.length + taste.avoid.length,
          }}
        />
      ) : (
        <EmptyState
          icon={Sun}
          title="Add a few pieces first"
          body="Today needs at least a top, a bottom and a pair of shoes before it can put an outfit together."
          action={
            <Button className="w-full" asChild>
              <Link href="/closet/add">Add pieces</Link>
            </Button>
          }
        />
      )}
    </Screen>
  );
}
