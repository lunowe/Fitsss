"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Chip, ChipRow, InsetGroup, Row, SectionFooter, SectionHeader } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_LINE_LENGTH, type TasteLine, type TasteProfile } from "@/lib/taste";
import { cn } from "@/lib/utils";
import { addTasteLine, refreshTasteNotes, removeTasteLine } from "@/server/taste";

/** Everything a piece strip needs to draw a tile, resolved on the server. */
export interface TasteBlockInfo {
  id: string;
  /** Short caption under the tile, e.g. "Jeans". */
  label: string;
  /** The full piece label, for the tooltip and the silhouette's accessible name. */
  title: string;
  typeId: string;
  variant?: string;
  color: string;
  secondaryColor?: string;
}

export interface StyleOption {
  id: string;
  name: string;
}

/** What `getTasteOverview` returns, as plain props. */
export interface TasteOverview {
  overall: TasteProfile;
  byStyle: Record<string, TasteProfile>;
  totalEvents: number;
}

const OVERALL = "overall";
const FADE_MS = 150;

/**
 * A coarse clock for "Refreshed 2 h ago". The wall time is read outside render
 * and frozen between ticks, so the snapshot is stable and the server renders
 * the "not known yet" branch (0) that the client hydrates into.
 */
const clockListeners = new Set<() => void>();
let clock = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(onStoreChange: () => void) {
  clock = Date.now();
  clockListeners.add(onStoreChange);
  clockTimer ??= setInterval(() => {
    clock = Date.now();
    for (const listener of clockListeners) listener();
  }, 60_000);
  return () => {
    clockListeners.delete(onStoreChange);
    if (clockListeners.size === 0) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

const clockSnapshot = () => clock;
const serverClockSnapshot = () => 0;

function emptyProfile(styleId: string | null, totalEvents: number): TasteProfile {
  return {
    styleId,
    lines: [],
    avoid: [],
    eventCount: 0,
    totalEvents,
    lastRefreshedAt: null,
    favorites: [],
    skipped: [],
  };
}

/** "just now" / "12 min ago" / "2 h ago" / "3 d ago". */
function ago(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function firstError(errors: unknown): string | null {
  if (Array.isArray(errors)) {
    const found = errors.find((entry) => typeof entry === "string");
    return typeof found === "string" ? found : null;
  }
  if (errors && typeof errors === "object") {
    const values = Object.values(errors as Record<string, unknown>).flat();
    const found = values.find((entry) => typeof entry === "string");
    return typeof found === "string" ? found : null;
  }
  return typeof errors === "string" ? errors : null;
}

/** One taste line: the text, where it came from, and a way to delete it. */
function LineRow({
  line,
  removing,
  onRemove,
}: {
  line: TasteLine;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <div className={cn("transition-opacity duration-150 ease-out", removing && "opacity-0")}>
      <Row
        title={line.text}
        subtitle={
          line.source === "user"
            ? "You said this"
            : `Seen ${line.evidence ?? 0}×`
        }
        className="[&_.truncate]:whitespace-normal"
        trailing={
          <button
            type="button"
            aria-label={`Delete “${line.text}”`}
            onClick={onRemove}
            disabled={removing}
            className="-my-2 flex size-11 items-center justify-center rounded-full text-label-3 transition-opacity duration-150 active:opacity-50 disabled:opacity-30"
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        }
      />
    </div>
  );
}

/** The "Add a line" row and the input it expands into. */
function AddLine({ onAdd, pending }: { onAdd: (text: string) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit() {
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText("");
    setOpen(false);
  }

  if (!open) {
    return (
      <Row
        leading={<Plus size={18} strokeWidth={2} className="text-tint" aria-hidden />}
        title={<span className="text-tint">Add a line</span>}
        onClick={() => setOpen(true)}
        chevron={false}
      />
    );
  }

  return (
    <div>
      <div className="flex min-h-11 items-center gap-2 py-2 pl-4 pr-2">
        <Input
          ref={inputRef}
          value={text}
          maxLength={MAX_LINE_LENGTH}
          placeholder="Something you know about yourself"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") setOpen(false);
          }}
          className="h-11 border-0 bg-transparent px-0 text-body focus-visible:ring-0"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-11 shrink-0 px-3 text-body text-tint"
          onClick={submit}
          disabled={pending || !text.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function PieceTile({ block }: { block: TasteBlockInfo }) {
  return (
    <Link
      href={`/closet/${block.id}`}
      title={block.title}
      className="block w-[72px] shrink-0 transition-transform duration-150 ease-out active:scale-[0.97]"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[10px] bg-card-2">
        <Silhouette
          typeId={block.typeId}
          variant={block.variant}
          color={block.color}
          secondaryColor={block.secondaryColor}
          size={44}
          title={block.title}
        />
      </div>
      <p className="mt-1 truncate text-caption text-label-2">{block.label}</p>
    </Link>
  );
}

function PieceStrip({ title, blocks }: { title: string; blocks: TasteBlockInfo[] }) {
  return (
    <div className="py-3">
      <p className="px-4 text-footnote text-label-2">{title}</p>
      <div className="mt-2 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {blocks.map((block) => (
          <PieceTile key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
}

/**
 * The Taste screen: what Fitsss thinks you like, per style. Everything is
 * editable — lines can be deleted or written by hand, and "Refresh now" asks
 * the model to read the latest choices again.
 */
export function TasteScreen({
  overview,
  styles,
  blocks,
}: {
  overview: TasteOverview;
  styles: StyleOption[];
  /** Every active piece, keyed by id, for the favourite / skipped strips. */
  blocks: Record<string, TasteBlockInfo>;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<string>(OVERALL);
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string[]>([]);
  const [notConfigured, setNotConfigured] = useState(false);
  // 0 until the clock store is subscribed, i.e. on the server and until hydration.
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, serverClockSnapshot);

  // Local copy so an action's returned profile shows immediately; it snaps back
  // to the server's copy whenever fresh props arrive.
  const [data, setData] = useState(overview);
  const [source, setSource] = useState(overview);
  if (source !== overview) {
    setSource(overview);
    setData(overview);
  }

  const styleId = scope === OVERALL ? null : scope;
  const profile =
    (styleId === null ? data.overall : data.byStyle[styleId]) ?? emptyProfile(styleId, data.totalEvents);

  const anyLines = [data.overall, ...Object.values(data.byStyle)].some(
    (entry) => entry.lines.length > 0 || entry.avoid.length > 0,
  );

  function apply(next: TasteProfile) {
    setData((current) =>
      next.styleId === null
        ? { ...current, overall: next }
        : { ...current, byStyle: { ...current.byStyle, [next.styleId as string]: next } },
    );
    router.refresh();
  }

  function add(kind: "like" | "avoid", text: string) {
    startTransition(async () => {
      const result = await addTasteLine({ styleId, text, kind });
      if (!result.ok) {
        toast(firstError(result.errors) ?? "Could not add that line");
        return;
      }
      apply(result.profile);
    });
  }

  function remove(lineId: string) {
    setRemoving((current) => [...current, lineId]);
    window.setTimeout(() => {
      startTransition(async () => {
        const result = await removeTasteLine({ styleId, lineId });
        setRemoving((current) => current.filter((id) => id !== lineId));
        if (!result.ok) {
          toast(firstError(result.errors) ?? "Could not delete that line");
          return;
        }
        apply(result.profile);
      });
    }, FADE_MS);
  }

  function refresh() {
    setNotConfigured(false);
    startTransition(async () => {
      const result = await refreshTasteNotes({ styleId });
      if (!result.ok) {
        if (result.code === "not-configured") setNotConfigured(true);
        else toast(result.error);
        return;
      }
      apply(result.profile);
    });
  }

  function strip(affinities: TasteProfile["favorites"]): TasteBlockInfo[] {
    return affinities
      .map((affinity) => blocks[affinity.blockId])
      .filter((block): block is TasteBlockInfo => Boolean(block));
  }

  const favorites = strip(profile.favorites);
  const skipped = strip(profile.skipped);

  return (
    <div className="pt-1">
      <ChipRow className="py-2">
        <Chip selected={scope === OVERALL} onClick={() => setScope(OVERALL)}>
          Overall
        </Chip>
        {styles.map((style) => (
          <Chip key={style.id} selected={scope === style.id} onClick={() => setScope(style.id)}>
            {style.name}
          </Chip>
        ))}
      </ChipRow>

      {anyLines ? null : (
        <SectionFooter className="mt-1">
          Fitsss keeps a short list of what you tend to like and skip, per style. It shapes every
          outfit. You can delete anything or add your own.
        </SectionFooter>
      )}

      <div className="space-y-6 pt-4">
        <section>
          <SectionHeader>Likes</SectionHeader>
          <InsetGroup className="mx-4">
            {profile.lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                removing={removing.includes(line.id)}
                onRemove={() => remove(line.id)}
              />
            ))}
            <AddLine pending={pending} onAdd={(text) => add("like", text)} />
          </InsetGroup>
          {profile.lines.length === 0 ? (
            <SectionFooter>
              Nothing learned yet. Save, wear, or nope a few outfits and refresh.
            </SectionFooter>
          ) : null}
        </section>

        <section>
          <SectionHeader>Avoid</SectionHeader>
          <InsetGroup className="mx-4">
            {profile.avoid.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                removing={removing.includes(line.id)}
                onRemove={() => remove(line.id)}
              />
            ))}
            <AddLine pending={pending} onAdd={(text) => add("avoid", text)} />
          </InsetGroup>
          {profile.avoid.length === 0 ? (
            <SectionFooter>
              Nothing learned yet. Save, wear, or nope a few outfits and refresh.
            </SectionFooter>
          ) : null}
        </section>

        {favorites.length || skipped.length ? (
          <section>
            <SectionHeader>Pieces</SectionHeader>
            <div className="mx-4 overflow-hidden rounded-xl bg-card">
              {favorites.length ? <PieceStrip title="You reach for" blocks={favorites} /> : null}
              {favorites.length && skipped.length ? (
                <div className="ml-4 border-t border-separator" />
              ) : null}
              {skipped.length ? <PieceStrip title="You tend to skip" blocks={skipped} /> : null}
            </div>
          </section>
        ) : null}

        <section>
          {notConfigured ? (
            <InsetGroup className="mx-4 mb-3">
              <div className="px-4 py-3 text-subhead text-label-2">
                Add ANTHROPIC_API_KEY to .env.local and restart the server.
              </div>
            </InsetGroup>
          ) : null}
          <div className="px-4">
            <Button variant="secondary" className="w-full" onClick={refresh} disabled={pending}>
              {pending ? (
                <Loader2
                  size={18}
                  strokeWidth={2}
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
              {pending ? "Reading your choices…" : "Refresh now"}
            </Button>
            <p className="mt-2 text-center text-footnote text-label-2">
              {profile.lastRefreshedAt
                ? now
                  ? `Refreshed ${ago(profile.lastRefreshedAt, now)} · `
                  : "Refreshed · "
                : "Never refreshed · "}
              {profile.eventCount} of {plural(profile.totalEvents, "choice", "choices")} considered
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
