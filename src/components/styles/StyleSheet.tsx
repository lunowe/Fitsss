"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createStyle, updateStyle } from "@/server/styles";
import type { Style } from "@/server/styles-queries";
import { MAX_STYLE_NAME, MAX_STYLE_TEXT } from "@/server/styles-validate";

const DESCRIPTION_PLACEHOLDER =
  "Clean lines, mostly neutrals, one dark piece, loose top with straight trousers, white sneakers.";
const RULES_PLACEHOLDER = "No logos\nNever tuck a tee";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-footnote font-medium uppercase tracking-[0.4px] text-label-2">{label}</p>
      {children}
      {hint ? <p className="mt-1.5 text-footnote text-label-2">{hint}</p> : null}
    </section>
  );
}

/**
 * Creates or edits one style. State is seeded at mount, so the caller remounts
 * it with a changing `key` each time the sheet opens to drop a cancelled edit.
 */
export function StyleSheet({
  style,
  open,
  onOpenChange,
  onRequestDelete,
}: {
  /** Null when creating a new style. */
  style: Style | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestDelete?: (style: Style) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(style?.name ?? "");
  const [description, setDescription] = useState(style?.description ?? "");
  const [rules, setRules] = useState(style?.rules ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const input = { name, description, rules };
    startTransition(async () => {
      const result = style ? await updateStyle(style.id, input) : await createStyle(input);
      if (!result.ok) {
        setError(result.errors[0] ?? "Could not save this style");
        return;
      }
      onOpenChange(false);
      toast(style ? "Saved" : "Style added");
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={style ? "Edit style" : "New style"}
      description={style ? undefined : "Describe how you actually dress."}
      footer={
        <div className="space-y-2">
          {error ? (
            <p role="alert" className="text-footnote text-destructive">
              {error}
            </p>
          ) : null}
          <Button className="w-full" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-7 pb-2 pt-2">
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Clean minimal"
            maxLength={MAX_STYLE_NAME}
            autoCapitalize="sentences"
            className="text-body"
          />
        </Field>

        <Field label="Description" hint="Written in your words. Outfits are generated against this text.">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={DESCRIPTION_PLACEHOLDER}
            maxLength={MAX_STYLE_TEXT}
            rows={5}
            className="min-h-[128px] text-body"
          />
        </Field>

        <Field label="Rules" hint="One rule per line. These are never broken.">
          <Textarea
            value={rules}
            onChange={(event) => setRules(event.target.value)}
            placeholder={RULES_PLACEHOLDER}
            maxLength={MAX_STYLE_TEXT}
            rows={4}
            className="min-h-[106px] text-body"
          />
        </Field>

        {style && onRequestDelete ? (
          <div className="pt-1">
            <Button
              variant="ghost"
              className="w-full text-destructive"
              onClick={() => onRequestDelete(style)}
              disabled={pending}
            >
              Delete style
            </Button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
