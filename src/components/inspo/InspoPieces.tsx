import { sentenceCase } from "@/components/closet/labels";
import { InsetGroup, Row, SectionFooter, SectionHeader } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import type { Block, InspoAnalysis, InspoMatch } from "@/domain";
import { cn } from "@/lib/utils";

import { coverageLine, matchWord, pieceColorLine, pieceTypeLabel } from "./labels";

/** The pieces the model saw, in the order it listed them. */
export function PieceStrip({ analysis }: { analysis: InspoAnalysis }) {
  if (!analysis.pieces.length) return null;

  return (
    <section>
      <SectionHeader>In the picture</SectionHeader>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {analysis.pieces.map((piece, index) => (
          <div
            key={`${piece.typeId}-${index}`}
            className={cn(
              "w-[104px] shrink-0 rounded-xl bg-card p-2",
              piece.confidence < 0.5 && "opacity-50",
            )}
          >
            <div className="flex h-14 items-center justify-center rounded-[10px] bg-card-2">
              <Silhouette
                typeId={piece.typeId}
                variant={piece.variant}
                color={piece.color.hex}
                secondaryColor={piece.secondaryColor?.hex}
                size={44}
                title={pieceTypeLabel(piece)}
              />
            </div>
            <p className="mt-1.5 truncate px-0.5 text-caption font-medium text-label">
              {pieceTypeLabel(piece)}
            </p>
            <p className="truncate px-0.5 text-caption text-label-2">{pieceColorLine(piece)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The dashed ring that stands in for a piece the closet does not have. */
function GapDot() {
  return (
    <span
      aria-hidden
      className="block size-9 rounded-full border border-dashed border-label-3"
    />
  );
}

/**
 * Every pictured piece against the closet: what it matched, and what is simply
 * missing. Matched rows open the piece; gaps stay quiet and red.
 */
export function ClosetMatches({
  analysis,
  match,
  blocks,
}: {
  analysis: InspoAnalysis;
  match: InspoMatch;
  blocks: Block[];
}) {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const matchOf = new Map(match.matches.map((entry) => [entry.pieceIndex, entry]));
  const gapOf = new Map(match.gaps.map((gap) => [gap.pieceIndex, gap]));

  return (
    <section>
      <SectionHeader>From your closet</SectionHeader>
      <div className="px-4">
        <InsetGroup>
          {analysis.pieces.map((piece, index) => {
            const matched = matchOf.get(index);
            const block = matched ? byId.get(matched.blockId) : undefined;

            if (matched && block) {
              return (
                <Row
                  key={`match-${index}`}
                  href={`/closet/${block.id}`}
                  leading={
                    <Silhouette
                      typeId={block.typeId}
                      variant={block.variant}
                      color={block.color.hex}
                      secondaryColor={block.secondaryColor?.hex}
                      size={36}
                    />
                  }
                  title={sentenceCase(block.label)}
                  subtitle={`Matched · ${matchWord(matched.score)}`}
                />
              );
            }

            const gap = gapOf.get(index);
            return (
              <Row
                key={`gap-${index}`}
                leading={<GapDot />}
                title={sentenceCase(gap?.description ?? `${pieceColorLine(piece)} ${pieceTypeLabel(piece).toLowerCase()}`)}
                subtitle={<span className="text-destructive">Missing</span>}
              />
            );
          })}
        </InsetGroup>
        <SectionFooter className="px-0">{coverageLine(match.coverage)}</SectionFooter>
      </div>
    </section>
  );
}
