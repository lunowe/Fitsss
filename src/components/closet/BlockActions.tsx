"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { InsetGroup, Row, Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import type { Block } from "@/domain";
import { archiveBlock } from "@/server/blocks";

import { EditBlockSheet } from "./EditBlockSheet";

/** Edit / style / remove actions at the foot of the item detail page. */
export function BlockActions({ block }: { block: Block }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  // Bumped on every open so EditBlockSheet remounts and re-seeds from `block`.
  const [editSession, setEditSession] = useState(0);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function openEdit() {
    setEditSession(editSession + 1);
    setEditOpen(true);
  }

  function remove() {
    startTransition(async () => {
      const result = await archiveBlock(block.id);
      if (!result.ok) {
        toast("Could not remove this piece");
        return;
      }
      setRemoveOpen(false);
      toast("Moved to Archived");
      router.push("/closet");
      router.refresh();
    });
  }

  return (
    <>
      <InsetGroup className="mx-4">
        <Row title="Edit" onClick={openEdit} chevron />
        <Row title="Style this piece" href={`/today?pin=${block.id}`} />
      </InsetGroup>

      <InsetGroup className="mx-4">
        <Row title="Remove from closet" destructive onClick={() => setRemoveOpen(true)} />
      </InsetGroup>

      <EditBlockSheet key={editSession} block={block} open={editOpen} onOpenChange={setEditOpen} />

      <Sheet
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${block.label}?`}
      >
        <p className="text-callout text-label-2">
          It moves to Archived, where you can restore or delete it for good.
        </p>
        <div className="mt-5 space-y-2 pb-2">
          <Button variant="destructive" className="w-full" onClick={remove} disabled={pending}>
            {pending ? "Removing…" : "Remove"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setRemoveOpen(false)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  );
}
