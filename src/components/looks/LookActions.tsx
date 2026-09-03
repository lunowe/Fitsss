"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { InsetGroup, Row, SectionFooter, Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { archiveLook, markWorn, renameLook } from "@/server/looks";
import type { Look } from "@/server/looks-queries";
import { MAX_LOOK_NAME } from "@/server/looks-validate";

function wornLabel(count: number): string {
  if (count === 0) return "Not yet";
  return `Worn ${count}×`;
}

/** Wear, rename and remove actions at the foot of a look's detail page. */
export function LookActions({
  look,
  lastWornLabel,
}: {
  look: Look;
  /** Pre-formatted on the server, e.g. "2 September" — avoids a locale mismatch. */
  lastWornLabel?: string;
}) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(look.name);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function wear() {
    startTransition(async () => {
      const result = await markWorn(look.id);
      if (!result.ok) {
        toast("Could not record that");
        return;
      }
      toast("Logged as worn today");
      router.refresh();
    });
  }

  function rename() {
    startTransition(async () => {
      const result = await renameLook(look.id, name);
      if (!result.ok) {
        setError(result.errors[0] ?? "Could not rename this look");
        return;
      }
      setRenameOpen(false);
      toast("Renamed");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await archiveLook(look.id);
      if (!result.ok) {
        toast("Could not remove this look");
        return;
      }
      setRemoveOpen(false);
      toast("Look removed");
      router.push("/looks");
      router.refresh();
    });
  }

  return (
    <>
      <div>
        <InsetGroup className="mx-4">
          <Row
            title="Wore this today"
            trailing={<span className="tabular-nums">{wornLabel(look.wornCount)}</span>}
            onClick={wear}
            disabled={pending}
          />
          <Row
            title="Rename"
            onClick={() => {
              setName(look.name);
              setError(null);
              setRenameOpen(true);
            }}
            chevron
          />
        </InsetGroup>
        {lastWornLabel ? <SectionFooter>Last worn {lastWornLabel}.</SectionFooter> : null}
      </div>

      <InsetGroup className="mx-4">
        <Row title="Remove look" destructive onClick={() => setRemoveOpen(true)} />
      </InsetGroup>

      <Sheet
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename look"
        footer={
          <div className="space-y-2">
            {error ? (
              <p role="alert" className="text-footnote text-destructive">
                {error}
              </p>
            ) : null}
            <Button className="w-full" onClick={rename} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Easy Monday"
          maxLength={MAX_LOOK_NAME}
          aria-label="Look name"
          className="text-body"
        />
      </Sheet>

      <Sheet open={removeOpen} onOpenChange={setRemoveOpen} title={`Remove ${look.name}?`}>
        <p className="text-callout text-label-2">
          The pieces stay in your closet. Only this saved combination goes away.
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
