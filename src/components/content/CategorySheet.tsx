"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Chip, Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES, CATEGORY_LABELS, MAX_HINT, MAX_LABEL, type Category } from "@/domain";
import { createCustomCategory, updateCustomCategory } from "@/server/content";
import type { CustomCategoryRecord } from "@/server/content-queries";

import { Field } from "./fields";

/**
 * Creates or edits one custom category. Seeded at mount, so the caller
 * remounts it with a changing key to drop a cancelled edit.
 */
export function CategorySheet({
  category,
  open,
  onOpenChange,
  onRequestDelete,
}: {
  category: CustomCategoryRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestDelete?: (category: CustomCategoryRecord) => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(category?.label ?? "");
  const [hint, setHint] = useState(category?.hint ?? "");
  const [role, setRole] = useState<Category>(category?.role ?? "accessory");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const input = { label, hint, role };
    startTransition(async () => {
      const result = category
        ? await updateCustomCategory(category.id, input)
        : await createCustomCategory(input);
      if (!result.ok) {
        setError(result.errors[0] ?? "Could not save this category");
        return;
      }
      onOpenChange(false);
      toast(category ? "Saved" : "Category added");
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? "Edit category" : "New category"}
      description={category ? undefined : "A drawer of your own, next to the built-in ones."}
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
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Jewelry"
            maxLength={MAX_LABEL}
            autoCapitalize="sentences"
            className="text-body"
          />
        </Field>

        <Field label="Hint" hint="The small line under the name in the add flow.">
          <Input
            value={hint}
            onChange={(event) => setHint(event.target.value)}
            placeholder="Chains, rings, cuffs"
            maxLength={MAX_HINT}
            autoCapitalize="sentences"
            className="text-body"
          />
        </Field>

        <Field label="Role" hint="Role decides how it is used in outfits.">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((option) => (
              <Chip key={option} selected={role === option} onClick={() => setRole(option)}>
                {CATEGORY_LABELS[option]}
              </Chip>
            ))}
          </div>
        </Field>

        {category && onRequestDelete ? (
          <div className="pt-1">
            <Button
              variant="ghost"
              className="w-full text-destructive"
              onClick={() => onRequestDelete(category)}
              disabled={pending}
            >
              Delete category
            </Button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
