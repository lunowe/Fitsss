"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { InsetGroup, Row, SectionFooter, Sheet } from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import { Button } from "@/components/ui/button";
import type { Block } from "@/domain";
import { deleteBlock, restoreBlock } from "@/server/blocks";

import { colorLineOf, headlineOf } from "./labels";

/** Archived pieces, each restorable or deletable for good. */
export function ArchivedList({ blocks }: { blocks: Block[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<Block | null>(null);
  const [pending, startTransition] = useTransition();

  function restore(block: Block) {
    startTransition(async () => {
      const result = await restoreBlock(block.id);
      toast(result.ok ? "Restored to your closet" : "Could not restore this piece");
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!target) return;
    const id = target.id;
    startTransition(async () => {
      const result = await deleteBlock(id);
      setTarget(null);
      toast(result.ok ? "Deleted" : "Could not delete this piece");
      router.refresh();
    });
  }

  return (
    <>
      <InsetGroup className="mx-4">
        {blocks.map((block) => (
          <Row
            key={block.id}
            leading={
              <span className="flex size-9 items-center justify-center rounded-lg bg-card-2">
                <Silhouette
                  typeId={block.typeId}
                  variant={block.variant}
                  color={block.color.hex}
                  secondaryColor={block.secondaryColor?.hex}
                  size={26}
                />
              </span>
            }
            title={headlineOf(block)}
            subtitle={colorLineOf(block)}
            trailing={
              <span className="flex items-center">
                <button
                  type="button"
                  onClick={() => restore(block)}
                  disabled={pending}
                  className="flex h-11 items-center px-2 text-subhead font-medium text-tint transition-opacity duration-150 active:opacity-60 disabled:opacity-40"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => setTarget(block)}
                  disabled={pending}
                  aria-label={`Delete ${block.label} permanently`}
                  className="flex size-11 items-center justify-center text-destructive transition-opacity duration-150 active:opacity-60 disabled:opacity-40"
                >
                  <Trash2 size={19} strokeWidth={1.75} />
                </button>
              </span>
            }
          />
        ))}
      </InsetGroup>
      <SectionFooter>Restoring puts a piece back in your closet. Deleting cannot be undone.</SectionFooter>

      <Sheet
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={target ? `Delete ${target.label}?` : "Delete piece?"}
      >
        <p className="text-callout text-label-2">
          This removes it for good. You can add it again later, but its history is gone.
        </p>
        <div className="mt-5 space-y-2 pb-2">
          <Button variant="destructive" className="w-full" onClick={confirmDelete} disabled={pending}>
            {pending ? "Deleting…" : "Delete for good"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setTarget(null)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  );
}
