import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnalysisPending } from "@/components/inspo/AnalysisPending";
import { InspoActions } from "@/components/inspo/InspoActions";
import { ClosetMatches, PieceStrip } from "@/components/inspo/InspoPieces";
import { inspoName } from "@/components/inspo/labels";
import { RestylePanel } from "@/components/inspo/RestylePanel";
import { BackButton, LargeTitleHeader, Screen } from "@/components/shell";
import { listBlocks } from "@/server/blocks-queries";
import { getInspo } from "@/server/inspo-queries";
import { listStyles } from "@/server/styles-queries";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const inspo = await getInspo(id);
  return { title: inspo ? inspoName(inspo.analysis) : "Inspiration" };
}

export default async function InspoDetailPage({ params }: Props) {
  const { id } = await params;
  const inspo = await getInspo(id);
  if (!inspo) notFound();

  // Archived pieces are included so a match keeps rendering after a piece
  // leaves the closet.
  const [blocks, styles] = await Promise.all([listBlocks({ includeArchived: true }), listStyles()]);
  const styleNames = styles.map((style) => ({ id: style.id, name: style.name }));

  return (
    <Screen>
      <LargeTitleHeader
        title={inspoName(inspo.analysis)}
        subtitle={inspo.analysis?.summary}
        leading={<BackButton href="/inspo" label="Inspo" />}
      />

      <div className="space-y-6 pt-2">
        <div className="px-4">
          <div className="rounded-xl bg-card p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by an authenticated route, not the image optimizer */}
            <img
              src={inspo.imageUrl}
              alt={inspo.analysis?.summary ?? "Inspiration picture"}
              className="mx-auto max-h-[60vh] w-full rounded-[10px] bg-card-2 object-contain"
            />
          </div>
        </div>

        {inspo.analysis === null ? (
          <AnalysisPending id={inspo.id} />
        ) : (
          <>
            <PieceStrip analysis={inspo.analysis} />
            {inspo.match ? (
              <ClosetMatches analysis={inspo.analysis} match={inspo.match} blocks={blocks} />
            ) : null}
            <RestylePanel inspoId={inspo.id} blocks={blocks} />
          </>
        )}

        <InspoActions
          id={inspo.id}
          styles={styleNames}
          styleId={inspo.styleId}
          note={inspo.note}
        />
      </div>
    </Screen>
  );
}
