import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lightbulb } from "lucide-react";

import { LookActions } from "@/components/looks/LookActions";
import { OutfitFlatLay, OutfitPieceList, outfitMeta } from "@/components/outfit";
import { BackButton, LargeTitleHeader, Screen, SectionHeader } from "@/components/shell";
import { listBlocks } from "@/server/blocks-queries";
import { getLook } from "@/server/looks-queries";
import { getStyle } from "@/server/styles-queries";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const look = await getLook(id);
  return { title: look ? look.name : "Look" };
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

export default async function LookDetailPage({ params }: Props) {
  const { id } = await params;
  const look = await getLook(id);
  if (!look) notFound();

  // Archived pieces are included so a look keeps rendering after a piece leaves the closet.
  const [blocks, style] = await Promise.all([
    listBlocks({ includeArchived: true }),
    look.styleId ? getStyle(look.styleId) : Promise.resolve(null),
  ]);

  const meta = outfitMeta({
    occasion: look.occasion,
    styleName: style?.name,
    weather: look.weather,
  });

  return (
    <Screen>
      <LargeTitleHeader
        leading={<BackButton href="/looks" label="Looks" />}
        title={look.name}
        subtitle={meta || undefined}
      />

      <div className="space-y-6 pt-2">
        <div className="mx-4 rounded-xl bg-card p-3">
          <OutfitFlatLay blocks={blocks} slots={look.slots} size="lg" />
        </div>

        {look.why || look.tip ? (
          <div className="space-y-3 px-4">
            {look.why ? <p className="text-callout text-label-2">{look.why}</p> : null}
            {look.tip ? (
              <p className="flex items-start gap-2 text-footnote text-label-2">
                <Lightbulb size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-label-3" aria-hidden />
                <span>{look.tip}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <SectionHeader>Pieces</SectionHeader>
          <OutfitPieceList blocks={blocks} slots={look.slots} className="mx-4" />
        </div>

        <LookActions
          look={look}
          lastWornLabel={look.lastWornAt ? DATE.format(look.lastWornAt) : undefined}
        />
      </div>
    </Screen>
  );
}
