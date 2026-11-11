"use client";

import { useState } from "react";
import { Loader2, Minus, Pencil, Plus, RotateCw, Trash2, type LucideIcon } from "lucide-react";

import { BlockThumb } from "@/components/closet/BlockTile";
import { headlineOf, typeLabelOf } from "@/components/closet/labels";
import { Chip, ChipRow, InsetGroup, Row, SectionFooter, SectionHeader, SegmentedControl, Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  LUGGAGE_OPTIONS,
  MAX_TRIP_NAME_LENGTH,
  MAX_TRIP_STEER_LENGTH,
  TRIP_ACTIVITIES,
  textLength,
  type Block,
  type Category,
  type LuggageId,
  type PackingItem,
  type Trip,
  type TripActivityId,
} from "@/domain";
import { cn } from "@/lib/utils";

import type { SwapTarget } from "./DayPlans";
import { dateRange, dayTitle, limitText, placeLine } from "./format";
import { pieceTitle, roleLabel } from "./pieces";
import type { StyleOption } from "./PlanTripForm";

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

/** The header's "…": pack again, edit, delete. */
export function TripActionsSheet({
  open,
  onOpenChange,
  trip,
  onRepack,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Trip;
  onRepack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const item = (icon: LucideIcon, title: string, action: () => void, destructive = false) => {
    const Icon = icon;
    return (
      <Row
        leading={<Icon size={20} strokeWidth={1.75} className={destructive ? "text-destructive" : "text-tint"} aria-hidden />}
        title={title}
        destructive={destructive}
        chevron={false}
        onClick={() => {
          onOpenChange(false);
          action();
        }}
      />
    );
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={trip.name} description={`${placeLine(trip.place)} · ${dateRange(trip.startDate, trip.endDate)}`}>
      <div className="space-y-4 pb-2">
        <InsetGroup className="bg-card-2">
          {trip.plan ? item(RotateCw, "Pack again…", onRepack) : null}
          {item(Pencil, "Edit trip", onEdit)}
        </InsetGroup>
        <InsetGroup className="bg-card-2">{item(Trash2, "Delete trip", onDelete, true)}</InsetGroup>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Swap a piece                                                        */
/* ------------------------------------------------------------------ */

export type SwapRequest =
  | { kind: "piece"; toBlockId: string }
  | { kind: "take-off" }
  | { kind: "separates"; top: string; bottom: string };

/**
 * The closet's pieces that can fill one slot of one day, the current one
 * outlined. Picking one swaps it in (the suitcase follows); picking the
 * current one just closes. A layer, outerwear or an accessory can be taken
 * off; a full-body piece can give way to a top and a bottom.
 */
export function SwapSheet({
  target,
  closet,
  onClose,
  onSwap,
}: {
  target: SwapTarget | null;
  /** Active pieces only: nothing archived can be swapped in. */
  closet: Block[];
  onClose: () => void;
  /** Resolves with the server's sentence when it refuses, null when done. */
  onSwap: (target: SwapTarget, request: SwapRequest) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Splitting a full-body piece: the top once chosen. */
  const [separates, setSeparates] = useState<{ top: Block | null } | null>(null);
  const [shown, setShown] = useState<SwapTarget | null>(target);
  if (target && target !== shown) {
    setShown(target);
    setBusy(null);
    setError(null);
    setSeparates(null);
  }
  const current = target ?? shown;
  if (!current) return null;
  const { entry, date } = current;

  const role: Category = separates ? (separates.top ? "bottom" : "top") : entry.role;
  const options = closet.filter((block) => block.category === role);
  const canTakeOff = !separates && (entry.slot === "layer" || entry.slot === "outerwear" || entry.slot === "accessories");
  const canSplit = !separates && entry.slot === "fullbody";

  const title = separates
    ? separates.top
      ? "Pick a bottom"
      : "Pick a top"
    : entry.block && entry.inCloset
      ? `Swap the ${typeLabelOf(entry.block).toLowerCase()}`
      : `Pick from ${roleLabel(entry.role).toLowerCase()}`;
  const intro = separates
    ? separates.top
      ? `With the ${pieceTitle(separates.top).toLowerCase()}: now the bottom.`
      : `For ${dayTitle(date)}: first the top, then the bottom.`
    : `For ${dayTitle(date)}. The suitcase follows.`;

  async function send(request: SwapRequest, busyKey: string) {
    if (busy || !current) return;
    setBusy(busyKey);
    setError(null);
    const refused = await onSwap(current, request);
    setBusy(null);
    if (refused) setError(refused);
  }

  function pick(block: Block) {
    if (busy) return;
    if (separates) {
      if (!separates.top) setSeparates({ top: block });
      else void send({ kind: "separates", top: separates.top.id, bottom: block.id }, block.id);
      return;
    }
    if (block.id === entry.blockId) {
      onClose();
      return;
    }
    void send({ kind: "piece", toBlockId: block.id }, block.id);
  }

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      dismissible={!busy}
      title={title}
      description={intro}
      headerTrailing={
        separates ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => setSeparates(separates.top ? { top: null } : null)}
            className="min-h-11 px-1 text-body text-tint transition-opacity duration-150 active:opacity-60 disabled:opacity-40"
          >
            Back
          </button>
        ) : null
      }
    >
      <div className="space-y-3 pb-2">
        {error ? (
          <p role="alert" className="text-subhead text-destructive">
            {error}
          </p>
        ) : null}
        {canSplit || canTakeOff ? (
          <div className="flex gap-2">
            {canSplit ? (
              <Button variant="secondary" size="sm" className="flex-1" disabled={Boolean(busy)} onClick={() => setSeparates({ top: null })}>
                Top and bottom instead
              </Button>
            ) : null}
            {canTakeOff ? (
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                disabled={Boolean(busy)}
                onClick={() => void send({ kind: "take-off" }, "take-off")}
              >
                {busy === "take-off" ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                Take it off
              </Button>
            ) : null}
          </div>
        ) : null}
        {options.length === 0 ? (
          <p className="py-3 text-subhead text-label-2">Nothing of that kind in your closet yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {options.map((block) => {
              const isCurrent = !separates && block.id === entry.blockId;
              return (
                <button
                  key={block.id}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => pick(block)}
                  aria-label={`${pieceTitle(block)}${isCurrent ? ", in this outfit" : ""}`}
                  aria-pressed={isCurrent}
                  className={cn(
                    "rounded-xl bg-card-2 p-2 text-left transition-transform duration-150 ease-out active:scale-[0.97] disabled:opacity-40",
                    isCurrent && "outline outline-2 outline-tint",
                    busy === block.id && "disabled:opacity-100",
                  )}
                >
                  <BlockThumb block={block} size={54} className="bg-card">
                    {busy === block.id ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-card/60">
                        <Loader2 size={20} className="animate-spin text-label-2 motion-reduce:animate-none" aria-hidden />
                      </span>
                    ) : null}
                  </BlockThumb>
                  <p className="mt-1.5 truncate text-caption text-label-2">{headlineOf(block)}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* How many to bring                                                   */
/* ------------------------------------------------------------------ */

/**
 * A stepper from what the days need (they wear it that often) up to what is
 * owned. A spare the days don't wear can be taken out.
 */
export function CountSheet({
  item,
  block,
  floor,
  onClose,
  onSave,
}: {
  item: PackingItem | null;
  block?: Block;
  /** What the days wear: the count may not go below it. */
  floor: number;
  onClose: () => void;
  onSave: (item: PackingItem, count: number) => Promise<string | null>;
}) {
  const [count, setCount] = useState(item?.count ?? 1);
  const [shown, setShown] = useState(item);
  const [saving, setSaving] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (item && item !== shown) {
    setShown(item);
    setCount(item.count);
    setError(null);
    setSaving(null);
  }
  const current = item ?? shown;
  if (!current || !block) return null;

  const min = Math.max(1, floor);
  const max = block.quantity;

  async function save(next: number, kind: "save" | "remove") {
    if (!current || saving) return;
    setSaving(kind);
    setError(null);
    const refused = await onSave(current, next);
    setSaving(null);
    if (refused) setError(refused);
  }

  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title={pieceTitle(block)}
      description={
        floor > 0
          ? `You have ${max}. The days need at least ${floor}.`
          : `You have ${max}. The days don’t wear it: it’s a spare.`
      }
      footer={
        <div className="space-y-2">
          {error ? (
            <p role="alert" className="text-footnote text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={count === current.count || Boolean(saving)} onClick={() => save(count, "save")}>
            {saving === "save" ? "Saving…" : "Save"}
          </Button>
          {floor === 0 ? (
            <Button variant="ghost" className="w-full text-destructive" disabled={Boolean(saving)} onClick={() => save(0, "remove")}>
              {saving === "remove" ? "Taking it out…" : "Take out of the bag"}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex items-center justify-center gap-6 py-4">
        <StepButton label="Bring one fewer" icon={Minus} disabled={count <= min || Boolean(saving)} onClick={() => setCount((n) => Math.max(min, n - 1))} />
        <p className="min-w-[4ch] text-center" aria-live="polite">
          <span className="block text-large-title tabular-nums">{count}</span>
          <span className="block text-footnote text-label-2">of {max}</span>
        </p>
        <StepButton label="Bring one more" icon={Plus} disabled={count >= max || Boolean(saving)} onClick={() => setCount((n) => Math.min(max, n + 1))} />
      </div>
    </Sheet>
  );
}

function StepButton({ label, icon: Icon, disabled, onClick }: { label: string; icon: LucideIcon; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full bg-fill text-label transition-[background-color,transform] duration-150 ease-out active:scale-95 active:bg-fill-2 disabled:opacity-30"
    >
      <Icon size={20} strokeWidth={2} aria-hidden />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Edit the trip                                                       */
/* ------------------------------------------------------------------ */

export interface TripEdit {
  name?: string;
  activities?: TripActivityId[];
  luggage?: LuggageId;
  laundry?: boolean;
  styleId?: string | null;
}

/**
 * Name, what the days are for, the bag, laundry and the style. Only what
 * changed is sent; `affectsPlan` tells the page to offer packing again.
 */
export function EditTripSheet({
  open,
  trip,
  styles,
  onClose,
  onSave,
}: {
  open: boolean;
  trip: Trip;
  styles: StyleOption[];
  onClose: () => void;
  onSave: (patch: TripEdit, affectsPlan: boolean) => Promise<string | null>;
}) {
  const [name, setName] = useState(trip.name);
  const [activities, setActivities] = useState<TripActivityId[]>(trip.options.activities);
  const [luggage, setLuggage] = useState<LuggageId>(trip.options.luggage);
  const [laundry, setLaundry] = useState(trip.options.laundry);
  const [styleId, setStyleId] = useState<string | null>(trip.options.styleId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(trip.name);
      setActivities(trip.options.activities);
      setLuggage(trip.options.luggage);
      setLaundry(trip.options.laundry);
      setStyleId(trip.options.styleId ?? null);
      setError(null);
    }
  }

  const sameActivities =
    activities.length === trip.options.activities.length && activities.every((a) => trip.options.activities.includes(a));
  const patch: TripEdit = {};
  const trimmed = name.trim();
  if (trimmed !== trip.name && !(trimmed === "" && trip.name === trip.place.name)) patch.name = trimmed || trip.place.name;
  if (!sameActivities) patch.activities = activities;
  if (luggage !== trip.options.luggage) patch.luggage = luggage;
  if (laundry !== trip.options.laundry) patch.laundry = laundry;
  if (styleId !== (trip.options.styleId ?? null)) patch.styleId = styleId;
  const dirty = Object.keys(patch).length > 0;
  const affectsPlan = ["activities", "luggage", "laundry", "styleId"].some((key) => key in patch);
  const knownStyle = styles.some((style) => style.id === trip.options.styleId);

  function toggle(id: TripActivityId) {
    setError(null);
    setActivities((current) =>
      current.includes(id) ? current.filter((a) => a !== id) : TRIP_ACTIVITIES.map((a) => a.id).filter((a) => a === id || current.includes(a)),
    );
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    const refused = await onSave(patch, affectsPlan);
    setSaving(false);
    if (refused) setError(refused);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
      dismissible={!saving}
      title="Edit trip"
      footer={
        <div className="space-y-2">
          {error ? (
            <p role="alert" className="text-footnote text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="w-full" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <fieldset disabled={saving} className="min-w-0 space-y-6 pb-2">
        <section>
          <SectionHeader className="px-0">Name</SectionHeader>
          <Input
            value={name}
            onChange={(event) => {
              setName(limitText(event.target.value, MAX_TRIP_NAME_LENGTH));
              setError(null);
            }}
            placeholder={trip.place.name}
            aria-label="Trip name"
            enterKeyHint="done"
            className="border-0 bg-card-2 text-body placeholder:text-label-3"
          />
          <SectionFooter className="px-0">
            {placeLine(trip.place)} · {dateRange(trip.startDate, trip.endDate)}. The place and dates can’t change: plan a
            new trip for those.
          </SectionFooter>
        </section>

        <section>
          <SectionHeader className="px-0">What for</SectionHeader>
          <div className="flex flex-wrap gap-2">
            {TRIP_ACTIVITIES.map((activity) => (
              <Chip key={activity.id} selected={activities.includes(activity.id)} onClick={() => toggle(activity.id)} title={activity.hint}>
                {activity.label}
              </Chip>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader className="px-0">Bag</SectionHeader>
          <SegmentedControl
            value={luggage}
            onValueChange={(next) => {
              setLuggage(next);
              setError(null);
            }}
            options={LUGGAGE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
            label="Bag"
            className="h-9"
            disabled={saving}
          />
          <InsetGroup className="mt-3 bg-card-2">
            <Row
              title={<label htmlFor="edit-laundry">Laundry on the way</label>}
              trailing={<Switch id="edit-laundry" checked={laundry} onCheckedChange={setLaundry} />}
            />
          </InsetGroup>
        </section>

        {styles.length || trip.options.styleId ? (
          <section>
            <SectionHeader className="px-0">Style</SectionHeader>
            <ChipRow className="-mx-4 py-0">
              <Chip selected={styleId === null} onClick={() => setStyleId(null)}>
                Any
              </Chip>
              {styles.map((style) => (
                <Chip key={style.id} selected={styleId === style.id} onClick={() => setStyleId(style.id)}>
                  {style.name}
                </Chip>
              ))}
              {trip.options.styleId && !knownStyle ? (
                <Chip selected={styleId === trip.options.styleId} disabled>
                  A deleted style
                </Chip>
              ) : null}
            </ChipRow>
          </section>
        ) : null}
      </fieldset>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Pack again                                                          */
/* ------------------------------------------------------------------ */

/** A note for the stylist, prefilled with the trip's, then "Pack again". */
export function RepackSheet({
  open,
  trip,
  onClose,
  onPack,
}: {
  open: boolean;
  trip: Trip;
  onClose: () => void;
  onPack: (note: string) => void;
}) {
  const [note, setNote] = useState(trip.options.steer ?? "");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setNote(trip.options.steer ?? "");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Pack again"
      description="The suitcase and every day are planned again from your closet. Ticks on pieces that stay packed are kept."
      footer={
        <Button
          className="w-full"
          onClick={() => {
            onPack(note.trim());
            onClose();
          }}
        >
          <RotateCw size={18} strokeWidth={1.75} aria-hidden />
          Pack again
        </Button>
      }
    >
      <Textarea
        value={note}
        onChange={(event) => setNote(limitText(event.target.value.replace(/\n/g, " "), MAX_TRIP_STEER_LENGTH))}
        placeholder="What should change? e.g. a wedding on Saturday"
        rows={3}
        aria-label="Note for the stylist"
        enterKeyHint="done"
        className="resize-none border-0 bg-card-2 text-body placeholder:text-label-3"
      />
      <NoteCount note={note} />
    </Sheet>
  );
}

/** "180 / 200" once a note nears the limit, counted as the server counts. */
export function NoteCount({ note, className }: { note: string; className?: string }) {
  const length = textLength(note);
  if (length < MAX_TRIP_STEER_LENGTH - 40) return null;
  return (
    <p
      className={cn(
        "mt-2 text-footnote tabular-nums",
        length >= MAX_TRIP_STEER_LENGTH ? "text-destructive" : "text-label-2",
        className,
      )}
    >
      {length} / {MAX_TRIP_STEER_LENGTH}
    </p>
  );
}

/** After an edit that changes the plan: pack again now, or keep it. */
export function RepackOfferSheet({
  open,
  onClose,
  onPack,
}: {
  open: boolean;
  onClose: () => void;
  onPack: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? null : onClose())} title="Pack again with these changes?">
      <p className="text-callout text-label-2">
        The suitcase and the days are planned again. Ticks on pieces that stay packed are kept.
      </p>
      <div className="mt-5 space-y-2 pb-2">
        <Button
          className="w-full"
          onClick={() => {
            onClose();
            onPack();
          }}
        >
          Pack again
        </Button>
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Keep the plan
        </Button>
      </div>
    </Sheet>
  );
}

/** Asks before deleting. */
export function DeleteTripSheet({
  open,
  trip,
  onClose,
  onDelete,
}: {
  open: boolean;
  trip: Trip;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !deleting) onClose();
      }}
      dismissible={!deleting}
      title={`Delete ${trip.name}?`}
    >
      <p className="text-callout text-label-2">The plan and your ticks go with it. Your closet is not touched.</p>
      <div className="mt-5 space-y-2 pb-2">
        <Button
          variant="destructive"
          className="w-full"
          disabled={deleting}
          onClick={async () => {
            setDeleting(true);
            await onDelete();
            setDeleting(false);
          }}
        >
          {deleting ? "Deleting…" : "Delete trip"}
        </Button>
        <Button variant="ghost" className="w-full" disabled={deleting} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}
