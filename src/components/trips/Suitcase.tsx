"use client";

import { Check, CircleCheck, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";

import { InsetGroup, SectionHeader } from "@/components/shell";
import { LUGGAGE_OPTIONS, TRIP_ACTIVITIES, type Block, type PackingItem, type Trip, type TripPlan } from "@/domain";
import { cn } from "@/lib/utils";

import { packedLine } from "./format";
import { PieceThumb, pieceSubtitle, pieceTitle, roleLabel } from "./pieces";

/**
 * The suitcase: how much is packed, what the plan could not satisfy, the
 * tips, then every piece grouped by category. Tap a row to tick it; the count
 * badge changes how many to bring.
 */
export function Suitcase({
  trip,
  plan,
  byId,
  locked,
  onToggle,
  onCount,
}: {
  trip: Trip;
  plan: TripPlan;
  byId: Map<string, Block>;
  /** Packing in progress: counts wait (ticks don't). */
  locked: boolean;
  onToggle: (item: PackingItem) => void;
  onCount: (item: PackingItem) => void;
}) {
  return (
    <div className="space-y-6">
      <Progress trip={trip} plan={plan} />

      {plan.warnings.length ? (
        <section>
          <SectionHeader>Heads up</SectionHeader>
          <NoteList notes={plan.warnings} icon={TriangleAlert} />
        </section>
      ) : null}

      {plan.tips.length ? (
        <section>
          <SectionHeader>Tips</SectionHeader>
          <NoteList notes={plan.tips} icon={Lightbulb} />
        </section>
      ) : null}

      {groups(plan, byId).map((group) => (
        <section key={group.key}>
          <SectionHeader>{group.label}</SectionHeader>
          <InsetGroup className="mx-4">
            {group.items.map((item) => (
              <PackingRow
                key={item.blockId}
                item={item}
                block={byId.get(item.blockId)}
                locked={locked}
                onToggle={() => onToggle(item)}
                onCount={() => onCount(item)}
              />
            ))}
          </InsetGroup>
        </section>
      ))}
    </div>
  );
}

function Progress({ trip, plan }: { trip: Trip; plan: TripPlan }) {
  const total = plan.packing.length;
  const packed = plan.packing.filter((item) => item.packed).length;
  const done = total > 0 && packed === total;
  const luggage = LUGGAGE_OPTIONS.find((option) => option.id === trip.options.luggage)?.label ?? trip.options.luggage;
  const activities = TRIP_ACTIVITIES.filter((a) => trip.options.activities.includes(a.id)).map((a) => a.label);
  const options = [luggage, activities.join(", "), trip.options.laundry ? "Laundry on the way" : "No laundry"]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-4 rounded-xl bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-headline tabular-nums", done ? "text-success" : "text-label")} aria-live="polite">
          {packedLine(trip)}
        </p>
        {done ? <CircleCheck size={20} strokeWidth={2} className="shrink-0 text-success" aria-hidden /> : null}
      </div>
      <div
        role="progressbar"
        aria-label="Packed"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={packed}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none",
            done ? "bg-success" : "bg-ink",
          )}
          style={{ width: `${total ? (packed / total) * 100 : 0}%` }}
        />
      </div>
      <p className="mt-2 text-footnote text-label-2">{options}</p>
    </div>
  );
}

function NoteList({ notes, icon: Icon }: { notes: string[]; icon: LucideIcon }) {
  return (
    <InsetGroup className="mx-4">
      {notes.map((note, index) => (
        <div key={index} className="pl-4">
          <div className="flex items-start gap-2.5 py-2.5 pr-4">
            <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-label-2" aria-hidden />
            <p className="text-subhead text-label">{note}</p>
          </div>
        </div>
      ))}
    </InsetGroup>
  );
}

interface Group {
  key: string;
  label: string;
  items: PackingItem[];
}

/** By category in the server's order (outerwear first); pieces the closet lost go last. */
function groups(plan: TripPlan, byId: Map<string, Block>): Group[] {
  const out: Group[] = [];
  const index = new Map<string, Group>();
  for (const item of plan.packing) {
    const block = byId.get(item.blockId);
    const key = block && !block.archivedAt ? block.category : "missing";
    let group = index.get(key);
    if (!group) {
      group = { key, label: key === "missing" ? "No longer in your closet" : roleLabel(block!.category), items: [] };
      index.set(key, group);
      out.push(group);
    }
    group.items.push(item);
  }
  const missing = index.get("missing");
  return missing ? [...out.filter((g) => g !== missing), missing] : out;
}

function PackingRow({
  item,
  block,
  locked,
  onToggle,
  onCount,
}: {
  item: PackingItem;
  block?: Block;
  locked: boolean;
  onToggle: () => void;
  onCount: () => void;
}) {
  const quantity = block?.quantity ?? item.count;
  const showsCount = quantity > 1 || item.count > 1;
  const title = block ? pieceTitle(block) : "A piece no longer in your closet";
  const subtitle = block ? pieceSubtitle(block) : undefined;

  return (
    <div className="pl-4">
      <div className="flex min-h-11 items-center gap-2 pr-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={item.packed}
          aria-label={[title, subtitle, showsCount ? `bringing ${item.count} of ${quantity}` : null].filter(Boolean).join(", ")}
          onClick={onToggle}
          disabled={!block || Boolean(block.archivedAt)}
          className="-ml-4 flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left transition-colors duration-100 active:bg-fill disabled:active:bg-transparent"
        >
          <span
            aria-hidden
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ease-out",
              item.packed ? "bg-ink text-ink-fg" : "border-[1.5px] border-label-3",
            )}
          >
            {item.packed ? <Check size={14} strokeWidth={3} /> : null}
          </span>
          <PieceThumb block={block} dimmed={Boolean(block?.archivedAt)} />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-body transition-colors duration-150",
                item.packed ? "text-label-2" : "text-label",
              )}
            >
              {title}
            </span>
            {subtitle ? <span className="block truncate text-subhead text-label-2">{subtitle}</span> : null}
          </span>
        </button>
        {showsCount && block && !block.archivedAt ? (
          <button
            type="button"
            onClick={onCount}
            disabled={locked}
            aria-label={`Bringing ${item.count} of ${quantity}. Change how many`}
            className="flex min-h-11 shrink-0 items-center px-1 disabled:opacity-40"
          >
            <span className="rounded-full bg-fill px-2 py-1 text-footnote font-medium tabular-nums text-label-2 transition-colors duration-100 active:bg-fill-2">
              ×{item.count} of {quantity}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
