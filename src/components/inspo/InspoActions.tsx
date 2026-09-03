"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookMarked, Check, PenLine, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { InsetGroup, Row, RowIcon, Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { deleteInspo, setInspoNote, setInspoStyle } from "@/server/inspo";
import type { InspoStyleName } from "@/components/inspo/InspoGrid";

const MAX_NOTE = 280;

/** Reference, note, remove: everything you can do to a saved picture. */
export function InspoActions({
  id,
  styles,
  styleId,
  note,
}: {
  id: string;
  styles: InspoStyleName[];
  styleId: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [styleOpen, setStyleOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");

  const currentStyle = styles.find((style) => style.id === styleId) ?? null;

  function chooseStyle(next: string | null) {
    startTransition(async () => {
      const result = await setInspoStyle({ id, styleId: next });
      if (!result.ok) {
        toast(result.error);
        return;
      }
      setStyleOpen(false);
      router.refresh();
    });
  }

  function saveNote() {
    startTransition(async () => {
      const result = await setInspoNote({ id, note: draft.trim() });
      if (!result.ok) {
        toast(result.error);
        return;
      }
      setNoteOpen(false);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteInspo(id);
      if (!result.ok) {
        toast("Could not remove this picture");
        return;
      }
      setConfirmOpen(false);
      router.push("/inspo");
      router.refresh();
    });
  }

  return (
    <>
      <div className="px-4">
        <InsetGroup>
          <Row
            leading={
              <RowIcon>
                <BookMarked aria-hidden />
              </RowIcon>
            }
            title="Use as reference for a style"
            subtitle={currentStyle?.name ?? "None"}
            chevron
            onClick={() => setStyleOpen(true)}
          />
          <Row
            leading={
              <RowIcon>
                <PenLine aria-hidden />
              </RowIcon>
            }
            title="Note"
            subtitle={note ?? undefined}
            chevron
            onClick={() => {
              setDraft(note ?? "");
              setNoteOpen(true);
            }}
          />
          <Row
            leading={
              <RowIcon className="text-destructive">
                <Trash2 aria-hidden />
              </RowIcon>
            }
            title="Remove picture"
            destructive
            onClick={() => setConfirmOpen(true)}
          />
        </InsetGroup>
      </div>

      <Sheet
        open={styleOpen}
        onOpenChange={setStyleOpen}
        title="Reference for"
        description="Outfits for this style will keep this picture in mind."
      >
        <InsetGroup className="bg-card-2">
          <Row
            title="None"
            trailing={styleId === null ? <Check size={18} className="text-tint" aria-hidden /> : undefined}
            chevron={false}
            disabled={pending}
            onClick={() => chooseStyle(null)}
          />
          {styles.map((style) => (
            <Row
              key={style.id}
              title={style.name}
              trailing={style.id === styleId ? <Check size={18} className="text-tint" aria-hidden /> : undefined}
              chevron={false}
              disabled={pending}
              onClick={() => chooseStyle(style.id)}
            />
          ))}
        </InsetGroup>
        {styles.length === 0 ? (
          <p className="mt-3 text-footnote text-label-2">
            You have no styles yet. Add one on the Styles tab first.
          </p>
        ) : null}
      </Sheet>

      <Sheet
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title="Note"
        description="What you want to remember about this picture."
        footer={
          <Button className="w-full" onClick={saveNote} disabled={pending}>
            Save
          </Button>
        }
      >
        <Textarea
          value={draft}
          maxLength={MAX_NOTE}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="The proportions, not the pieces."
          className="bg-card-2"
          aria-label="Note"
        />
      </Sheet>

      <Sheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove this picture?"
        description="The picture and its analysis are deleted. Looks you saved from it stay."
        footer={
          <div className="space-y-2">
            <Button variant="destructive" className="w-full" onClick={remove} disabled={pending}>
              Remove picture
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setConfirmOpen(false)}>
              Keep it
            </Button>
          </div>
        }
      >
        <p className="pb-2 text-callout text-label-2">This cannot be undone.</p>
      </Sheet>
    </>
  );
}
