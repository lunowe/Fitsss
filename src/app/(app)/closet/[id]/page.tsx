import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BlockActions } from "@/components/closet/BlockActions";
import { BlockThumb } from "@/components/closet/BlockTile";
import {
  materialLabelOf,
  sentenceCase,
  typeLabelOf,
  variationLabelOf,
} from "@/components/closet/labels";
import {
  BackButton,
  InsetGroup,
  LargeTitleHeader,
  Row,
  Screen,
  SectionHeader,
  SwatchDot,
} from "@/components/shell";
import { PATTERN_LABELS, WEIGHT_LABELS, getPieceType, isGarment } from "@/domain";
import { getBlock } from "@/server/blocks-queries";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const block = await getBlock(id);
  return { title: block ? typeLabelOf(block) : "Piece" };
}

/** Five dots, `value` of them filled. Used for warmth and formality. */
function Dots({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${label} ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          aria-hidden
          className={cn("size-1.5 rounded-full", step <= value ? "bg-label" : "bg-label-3")}
        />
      ))}
    </span>
  );
}

function ColorValue({ name, hex }: { name: string; hex: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <SwatchDot hex={hex} size={12} className="ring-1 ring-inset ring-separator" />
      {name}
    </span>
  );
}

export default async function BlockDetailPage({ params }: Props) {
  const { id } = await params;
  const block = await getBlock(id);
  if (!block) notFound();

  const type = getPieceType(block.typeId);
  if (!type) notFound();

  const garment = isGarment(type);
  const material = materialLabelOf(block);
  const variation = variationLabelOf(block);
  const seasons = block.seasons.map((season) => season[0].toUpperCase() + season.slice(1)).join(", ");

  return (
    <Screen>
      <LargeTitleHeader
        leading={<BackButton href="/closet" label="Closet" />}
        title={type.label}
        subtitle={sentenceCase(block.label)}
      />

      <div className="space-y-6 pt-2">
        <div className="mx-4 rounded-xl bg-card p-3">
          <BlockThumb block={block} size={168} className="aspect-[3/2]" />
        </div>

        <div>
          <SectionHeader>Details</SectionHeader>
          <InsetGroup className="mx-4">
            <Row title="Type" trailing={type.label} />
            <Row title="Color" trailing={<ColorValue name={block.color.name} hex={block.color.hex} />} />
            {block.secondaryColor ? (
              <Row
                title="Second color"
                trailing={
                  <ColorValue name={block.secondaryColor.name} hex={block.secondaryColor.hex} />
                }
              />
            ) : null}
            <Row title={garment ? "Fit" : "Style"} trailing={variation || "—"} />
            <Row title="Material" trailing={material || "—"} />
            <Row title="Pattern" trailing={PATTERN_LABELS[block.pattern]} />
            <Row title="Weight" trailing={WEIGHT_LABELS[block.effectiveWeight]} />
            <Row title="Warmth" trailing={<Dots value={block.warmth} label="Warmth" />} />
            <Row title="Formality" trailing={<Dots value={block.formality} label="Formality" />} />
            <Row title="Seasons" trailing={seasons} />
            <Row title="Quantity" trailing={<span className="tabular-nums">{block.quantity}</span>} />
          </InsetGroup>
        </div>

        {block.nickname || block.notes ? (
          <div>
            <SectionHeader>Notes</SectionHeader>
            <InsetGroup className="mx-4">
              {block.nickname ? <Row title="Nickname" trailing={block.nickname} /> : null}
              {block.notes ? (
                <div>
                  <div className="px-4 py-3 text-subhead text-label-2">{block.notes}</div>
                </div>
              ) : null}
            </InsetGroup>
          </div>
        ) : null}

        <BlockActions block={block} />
      </div>
    </Screen>
  );
}
