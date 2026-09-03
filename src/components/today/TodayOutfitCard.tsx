"use client";

import { useState, useTransition } from "react";
import {
  ArrowLeftRight,
  Bookmark,
  Check,
  ChevronRight,
  Lightbulb,
  ThumbsDown,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { BlockThumb } from "@/components/closet/BlockTile";
import { headlineOf, sentenceCase } from "@/components/closet/labels";
import { OutfitFlatLay, OutfitPieceList } from "@/components/outfit";
import { Chip, SwatchDot, Sheet } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  DISLIKE_REASONS,
  SLOT_CATEGORY,
  type Block,
  type OccasionId,
  type Outfit,
  type OutfitSlot,
  type WeatherSnapshot,
} from "@/domain";
import { cn } from "@/lib/utils";
import { recordOutfitEvent } from "@/server/feedback";
import { swapSlot } from "@/server/generate";
import { markWorn, saveLook } from "@/server/looks";

/** What the user has already done with one card, kept per outfit id. */
export interface OutfitCardState {
  lookId?: string;
  saved: boolean;
  worn: boolean;
  disliked: boolean;
}

export const EMPTY_CARD_STATE: OutfitCardState = { saved: false, worn: false, disliked: false };

const SLOT_LABELS: Record<OutfitSlot | "accessories", string> = {
  outerwear: "Outerwear",
  layer: "Layer",
  top: "Top",
  fullbody: "Full body",
  bottom: "Bottom",
  footwear: "Shoes",
  accessories: "Accessory",
};

type PieceEntry = { key: string; slot: OutfitSlot | "accessories"; block: Block };

/** The outfit's pieces in wearing order, each tagged with the slot it fills. */
function pieceEntries(outfit: Outfit, byId: Map<string, Block>): PieceEntry[] {
  const entries: PieceEntry[] = [];
  for (const slot of ["outerwear", "layer", "top", "fullbody", "bottom", "footwear"] as const) {
    const id = outfit.slots[slot];
    const block = id ? byId.get(id) : undefined;
    if (block) entries.push({ key: slot, slot, block });
  }
  for (const id of outfit.slots.accessories) {
    const block = byId.get(id);
    if (block) entries.push({ key: `accessories:${id}`, slot: "accessories", block });
  }
  return entries;
}

/** One of the four square actions under a card. */
function ActionTile({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex h-11 flex-col items-center justify-center gap-1 rounded-xl transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:opacity-40",
        active ? "bg-ink text-ink-fg" : "bg-fill text-label",
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
      <span className="text-caption font-medium leading-none">{label}</span>
    </button>
  );
}

/**
 * One generated outfit: the flat lay, why it works, its pieces, and the four
 * things you can do with it. Every action is one tap away from the thumb.
 */
export function TodayOutfitCard({
  outfit,
  blocks,
  generationId,
  styleId,
  occasion,
  weather,
  state,
  onStateChange,
  onOutfitChange,
}: {
  outfit: Outfit;
  blocks: Block[];
  generationId: string;
  styleId?: string;
  occasion: OccasionId;
  weather: WeatherSnapshot;
  state: OutfitCardState;
  onStateChange: (next: OutfitCardState) => void;
  onOutfitChange: (outfit: Outfit) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [piecesOpen, setPiecesOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<PieceEntry | null>(null);
  const [nopeOpen, setNopeOpen] = useState(false);
  const [fading, setFading] = useState(false);

  const byId = new Map(blocks.map((block) => [block.id, block]));
  const entries = pieceEntries(outfit, byId);

  function save() {
    if (state.saved) return;
    startTransition(async () => {
      const result = await saveLook({ outfit, styleId, occasion, weather, generationId });
      if (!result.ok) {
        toast(result.errors[0] ?? "Could not save this look");
        return;
      }
      onStateChange({ ...state, saved: true, lookId: result.look.id });
      toast("Saved to Looks");
    });
  }

  function wear() {
    if (state.worn) return;
    startTransition(async () => {
      let lookId = state.lookId;
      if (!lookId) {
        const saved = await saveLook({ outfit, styleId, occasion, weather, generationId });
        if (!saved.ok) {
          toast(saved.errors[0] ?? "Could not save this look");
          return;
        }
        lookId = saved.look.id;
      }
      const worn = await markWorn(lookId);
      if (!worn.ok) {
        toast(worn.errors[0] ?? "Could not record that");
        return;
      }
      onStateChange({ ...state, saved: true, worn: true, lookId });
      toast("Have a good day");
    });
  }

  function applySwap(entry: PieceEntry, block: Block) {
    // Picking the piece that is already in the outfit means "leave it alone".
    if (block.id === entry.block.id) {
      setSwapTarget(null);
      setSwapOpen(false);
      return;
    }
    setFading(true);
    startTransition(async () => {
      const result = await swapSlot({
        generationId,
        outfitId: outfit.id,
        slot: entry.slot,
        toBlockId: block.id,
        fromBlockId: entry.block.id,
      });
      if (!result.ok) {
        setFading(false);
        toast(result.error);
        return;
      }
      onOutfitChange(result.outfit);
      setSwapTarget(null);
      setSwapOpen(false);
      // Let the new pieces paint before fading back in.
      setTimeout(() => setFading(false), 20);
    });
  }

  function dislike(reason: string) {
    startTransition(async () => {
      await recordOutfitEvent({ type: "disliked", outfit, reason, styleId, occasion, generationId });
      onStateChange({ ...state, disliked: true });
      setNopeOpen(false);
    });
  }

  const swapOptions = swapTarget
    ? blocks.filter(
        (block) =>
          block.category ===
          (swapTarget.slot === "accessories" ? "accessory" : SLOT_CATEGORY[swapTarget.slot]),
      )
    : [];

  return (
    <>
      <article
        className={cn(
          "rounded-xl bg-card p-3 transition-opacity duration-200 ease-out",
          state.disliked && "opacity-60",
        )}
      >
        <div className={cn("transition-opacity duration-150 ease-out", fading && "opacity-0")}>
          <OutfitFlatLay blocks={blocks} slots={outfit.slots} size="lg" />
        </div>

        <div className="px-1 pt-3">
          <h3 className="text-title-3">{outfit.name}</h3>
          {outfit.why ? <p className="mt-1 text-callout text-label-2">{outfit.why}</p> : null}
          {outfit.tip ? (
            <p className="mt-2 flex items-start gap-1.5 text-footnote text-label-2">
              <Lightbulb size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
              <span>{outfit.tip}</span>
            </p>
          ) : null}
          {state.disliked ? <p className="mt-2 text-caption text-label-2">Noted</p> : null}
        </div>

        <button
          type="button"
          onClick={() => setPiecesOpen(true)}
          aria-label={`All ${entries.length} pieces in ${outfit.name}`}
          className={cn(
            "mt-3 flex w-full items-center gap-1.5 overflow-hidden rounded-xl bg-card-2 px-2 py-2 transition-[background-color,opacity] duration-150 ease-out active:bg-fill",
            fading && "opacity-0",
          )}
        >
          {entries.map((entry) => (
            <span key={entry.key} className="flex shrink-0 flex-col items-center gap-1">
              <Silhouette
                typeId={entry.block.typeId}
                variant={entry.block.variant}
                color={entry.block.color.hex}
                secondaryColor={entry.block.secondaryColor?.hex}
                size={36}
              />
              <SwatchDot
                hex={entry.block.color.hex}
                secondaryHex={entry.block.secondaryColor?.hex}
                size={6}
              />
            </span>
          ))}
          <ChevronRight size={16} className="ml-auto shrink-0 text-label-3" aria-hidden />
        </button>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <ActionTile
            icon={Bookmark}
            label={state.saved ? "Saved" : "Save"}
            active={state.saved}
            disabled={pending}
            onClick={save}
          />
          <ActionTile
            icon={Check}
            label={state.worn ? "Wearing" : "Wear"}
            active={state.worn}
            disabled={pending}
            onClick={wear}
          />
          <ActionTile
            icon={ArrowLeftRight}
            label="Swap"
            disabled={pending}
            onClick={() => {
              setSwapTarget(null);
              setSwapOpen(true);
            }}
          />
          <ActionTile
            icon={ThumbsDown}
            label="Nope"
            active={state.disliked}
            disabled={pending}
            onClick={() => setNopeOpen(true)}
          />
        </div>
      </article>

      <Sheet open={piecesOpen} onOpenChange={setPiecesOpen} title={outfit.name}>
        <OutfitPieceList blocks={blocks} slots={outfit.slots} />
      </Sheet>

      <Sheet
        open={swapOpen}
        onOpenChange={(open) => {
          setSwapOpen(open);
          if (!open) setSwapTarget(null);
        }}
        title={swapTarget ? `Swap the ${SLOT_LABELS[swapTarget.slot].toLowerCase()}` : "Swap a piece"}
        description={swapTarget ? undefined : "Pick the piece you want to change."}
        headerTrailing={
          swapTarget ? (
            <button
              type="button"
              onClick={() => setSwapTarget(null)}
              className="min-h-11 px-1 text-body text-tint transition-opacity duration-150 active:opacity-60"
            >
              Back
            </button>
          ) : null
        }
      >
        {swapTarget ? (
          <div className="grid grid-cols-3 gap-3 pb-2">
            {swapOptions.map((block) => {
              const current = block.id === swapTarget.block.id;
              return (
                <button
                  key={block.id}
                  type="button"
                  disabled={pending}
                  onClick={() => applySwap(swapTarget, block)}
                  className={cn(
                    "rounded-xl bg-card-2 p-2 text-left transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-40",
                    current && "outline outline-2 outline-tint",
                  )}
                >
                  <BlockThumb block={block} size={54} className="bg-card" />
                  <p className="mt-1.5 truncate text-caption text-label-2">{headlineOf(block)}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {entries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setSwapTarget(entry)}
                className="flex w-full items-center gap-3 rounded-xl bg-card-2 p-2 pr-3 text-left transition-transform duration-150 ease-out active:scale-[0.99]"
              >
                <Silhouette
                  typeId={entry.block.typeId}
                  variant={entry.block.variant}
                  color={entry.block.color.hex}
                  secondaryColor={entry.block.secondaryColor?.hex}
                  size={36}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-label">
                    {sentenceCase(entry.block.label)}
                  </span>
                  <span className="block truncate text-footnote text-label-2">
                    {entry.slot === "accessories"
                      ? CATEGORY_LABELS.accessory
                      : SLOT_LABELS[entry.slot]}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-label-3" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet
        open={nopeOpen}
        onOpenChange={setNopeOpen}
        title="Not this one?"
        description="Tell me why and the next set will avoid it."
        footer={
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              onStateChange({ ...state, disliked: true });
              setNopeOpen(false);
            }}
          >
            Skip
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2 pb-2">
          {DISLIKE_REASONS.map((reason) => (
            <Chip key={reason.id} disabled={pending} onClick={() => dislike(reason.id)}>
              {reason.label}
            </Chip>
          ))}
        </div>
      </Sheet>
    </>
  );
}
