"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, BookMarked, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";

import { BottomBar, EmptyState, InsetGroup, SectionFooter, Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { archiveStyle, reorderStyles } from "@/server/styles";
import type { Style } from "@/server/styles-queries";
import { MAX_ACTIVE_STYLES } from "@/server/styles-validate";

import { StyleSheet } from "./StyleSheet";

/** The description's first line, which is what the row shows. */
function summaryOf(style: Style): string {
  return style.description.split("\n")[0]?.trim() ?? "";
}

function ReorderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-lg text-tint transition-opacity duration-150 active:opacity-50 disabled:text-label-3"
    >
      {children}
    </button>
  );
}

/**
 * The Styles screen body: the ordered list, the edit sheet, the delete confirm
 * and the sticky "New style" action.
 */
export function StylesManager({ styles }: { styles: Style[] }) {
  const router = useRouter();
  const [items, setItems] = useState(styles);
  const [editing, setEditing] = useState<Style | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Bumped on every open so StyleSheet remounts and re-seeds its fields.
  const [sheetSession, setSheetSession] = useState(0);
  const [confirm, setConfirm] = useState<Style | null>(null);
  const [pending, startTransition] = useTransition();

  // `items` is the optimistic order shown while a reorder is in flight; it
  // snaps back to the server's order as soon as fresh props arrive.
  const [source, setSource] = useState(styles);
  if (source !== styles) {
    setSource(styles);
    setItems(styles);
  }

  const atLimit = items.length >= MAX_ACTIVE_STYLES;

  function openSheet(style: Style | null) {
    setEditing(style);
    setSheetSession((session) => session + 1);
    setSheetOpen(true);
  }

  function move(index: number, delta: number) {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    startTransition(async () => {
      const result = await reorderStyles(next.map((style) => style.id));
      if (!result.ok) {
        setItems(items);
        toast("Could not reorder your styles");
        return;
      }
      router.refresh();
    });
  }

  function remove(style: Style) {
    startTransition(async () => {
      const result = await archiveStyle(style.id);
      if (!result.ok) {
        toast("Could not delete this style");
        return;
      }
      setConfirm(null);
      toast("Style deleted");
      router.refresh();
    });
  }

  return (
    <>
      {items.length === 0 ? (
        <>
          <EmptyState
            icon={BookMarked}
            title="No styles yet"
            body="A style is how you actually dress, written in your own words. Every outfit gets generated against it."
            action={
              <Button className="w-full" onClick={() => openSheet(null)}>
                <Plus size={20} aria-hidden /> Add your first style
              </Button>
            }
          />
          <SectionFooter className="text-center">
            Pick two or three, and keep them honest: the ones you reach for, not the ones you mean to.
          </SectionFooter>
        </>
      ) : (
        <div className="px-4 pt-2">
          <InsetGroup>
            {items.map((style, index) => {
              const summary = summaryOf(style);
              return (
                <div key={style.id} className="pl-4">
                  <div className="flex min-h-11 items-center gap-2 py-1.5 pr-2">
                    <button
                      type="button"
                      onClick={() => openSheet(style)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left transition-opacity duration-100 active:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-label">{style.name}</span>
                        {summary ? (
                          <span className="block truncate text-subhead text-label-2">{summary}</span>
                        ) : null}
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-label-3" aria-hidden />
                    </button>
                    <div className="flex shrink-0 items-center">
                      <ReorderButton
                        label={`Move ${style.name} up`}
                        disabled={index === 0 || pending}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={18} strokeWidth={2} aria-hidden />
                      </ReorderButton>
                      <ReorderButton
                        label={`Move ${style.name} down`}
                        disabled={index === items.length - 1 || pending}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={18} strokeWidth={2} aria-hidden />
                      </ReorderButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </InsetGroup>
          <SectionFooter>
            {atLimit
              ? `Six styles is the limit. Delete one to add another.`
              : "The first style is the one Today reaches for by default."}
          </SectionFooter>
        </div>
      )}

      {items.length > 0 ? (
        <BottomBar>
          <Button className="w-full" disabled={atLimit} onClick={() => openSheet(null)}>
            <Plus size={20} aria-hidden /> New style
          </Button>
        </BottomBar>
      ) : null}

      <StyleSheet
        key={sheetSession}
        style={editing}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onRequestDelete={(style) => {
          setSheetOpen(false);
          setConfirm(style);
        }}
      />

      <Sheet
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm ? `Delete ${confirm.name}?` : "Delete style"}
      >
        <p className="text-callout text-label-2">
          Outfits already saved keep their pieces. Only the style itself goes away.
        </p>
        <div className="mt-5 space-y-2 pb-2">
          <Button
            variant="destructive"
            className="w-full"
            disabled={pending}
            onClick={() => confirm && remove(confirm)}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  );
}
