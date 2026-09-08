"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Chip, SegmentedControl, Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MATERIALS,
  MAX_LABEL,
  MAX_OPTIONS,
  MAX_SUGGESTED_COLORS,
  PATTERNS,
  PATTERN_LABELS,
  WEIGHTS,
  WEIGHT_LABELS,
  isGarmentRole,
  listCategories,
  suggestedOptionsForRole,
  type Category,
  type MaterialId,
  type Pattern,
  type Weight,
} from "@/domain";
import { createCustomPieceType, updateCustomPieceType } from "@/server/content";
import type { CustomPieceTypeRecord, PieceArtRecord } from "@/server/content-queries";

import { ArtRow } from "./ArtRow";
import { ChipMultiSelect, ColorPicker, Field, HalfStepper, TagEditor } from "./fields";

const WEIGHT_SEGMENTS = WEIGHTS.map((weight) => ({ value: weight, label: WEIGHT_LABELS[weight] }));

function toggle<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/**
 * Creates or edits one custom piece type. Everything a built-in type declares
 * in code is a control here; the role behind the chosen category decides
 * whether the piece is described by a fit or by a style variant.
 */
export function PieceTypeSheet({
  type,
  defaultCategoryId,
  art,
  usage,
  open,
  onOpenChange,
  onRequestDelete,
}: {
  type: CustomPieceTypeRecord | null;
  /** Pre-fills the category for a new type from the list the user was in. */
  defaultCategoryId: string;
  art: PieceArtRecord | null;
  /** Pieces in the closet using this type, for the delete warning. */
  usage: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestDelete?: (type: CustomPieceTypeRecord, usage: number) => void;
}) {
  const router = useRouter();
  const categories = listCategories();

  const [categoryId, setCategoryId] = useState(type?.categoryId ?? defaultCategoryId);
  const [label, setLabel] = useState(type?.label ?? "");
  const [plural, setPlural] = useState(type?.plural ?? "");
  const [fits, setFits] = useState<string[]>(type?.fitOptions ?? []);
  const [variants, setVariants] = useState<string[]>(type?.variantOptions ?? []);
  const [materials, setMaterials] = useState<MaterialId[]>(type?.materialOptions ?? ["cotton"]);
  const [patterns, setPatterns] = useState<Pattern[]>(type?.patternOptions ?? ["solid"]);
  const [colors, setColors] = useState<string[]>(type?.suggestedColors ?? []);
  const [weight, setWeight] = useState<Weight>(type?.defaultWeight ?? "mid");
  const [warmth, setWarmth] = useState(type?.baseWarmth ?? 2);
  const [formality, setFormality] = useState(type?.baseFormality ?? 2.5);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const role: Category =
    categories.find((category) => category.id === categoryId)?.role ?? ("top" as Category);
  const garment = isGarmentRole(role);
  const options = garment ? fits : variants;

  function save() {
    const input = {
      label,
      plural,
      categoryId,
      role,
      fitOptions: garment ? fits : [],
      variantOptions: garment ? [] : variants,
      materialOptions: materials,
      patternOptions: patterns,
      suggestedColors: colors,
      defaultWeight: weight,
      baseWarmth: warmth,
      baseFormality: formality,
    };
    startTransition(async () => {
      const result = type
        ? await updateCustomPieceType(type.id, input)
        : await createCustomPieceType(input);
      if (!result.ok) {
        setError(result.errors[0] ?? "Could not save this piece type");
        return;
      }
      onOpenChange(false);
      toast(type ? "Saved" : "Piece type added");
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={type ? "Edit piece type" : "New piece type"}
      description={type ? undefined : "Everything a built-in type knows, as data."}
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
            placeholder="Kimono"
            maxLength={MAX_LABEL}
            autoCapitalize="sentences"
            className="text-body"
          />
        </Field>

        <Field label="Plural" hint="Used for counts, like “3 Kimonos”.">
          <Input
            value={plural}
            onChange={(event) => setPlural(event.target.value)}
            placeholder={label ? `${label}s` : "Kimonos"}
            maxLength={MAX_LABEL}
            autoCapitalize="sentences"
            className="text-body"
          />
        </Field>

        <Field
          label="Category"
          hint={
            garment
              ? "A garment: it is described by how it fits."
              : "Worn on top of an outfit: it is described by its style."
          }
        >
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Chip
                key={category.id}
                selected={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
              >
                {category.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field
          label={garment ? "Fits" : "Styles"}
          hint={`Up to ${MAX_OPTIONS}. These are the only ${garment ? "fits" : "styles"} you can pick when adding one.`}
        >
          <TagEditor
            values={options}
            onChange={garment ? setFits : setVariants}
            suggestions={suggestedOptionsForRole(role)}
            placeholder={garment ? "relaxed" : "chain"}
            max={MAX_OPTIONS}
          />
        </Field>

        <Field label="Materials" hint="The first one is offered as the default.">
          <ChipMultiSelect
            options={MATERIALS.map((material) => ({ value: material.id, label: material.label }))}
            selected={materials}
            onToggle={(value) => setMaterials(toggle(materials, value as MaterialId))}
          />
        </Field>

        <Field label="Patterns" hint="Solid is always available.">
          <ChipMultiSelect
            options={PATTERNS.map((pattern) => ({ value: pattern, label: PATTERN_LABELS[pattern] }))}
            selected={patterns}
            locked={["solid"]}
            onToggle={(value) => setPatterns(toggle(patterns, value as Pattern))}
          />
        </Field>

        <Field
          label="Suggested colors"
          hint={`Shown first in the colour picker. Up to ${MAX_SUGGESTED_COLORS}.`}
        >
          <ColorPicker
            selected={colors}
            max={MAX_SUGGESTED_COLORS}
            onToggle={(id) => setColors(toggle(colors, id))}
          />
        </Field>

        <Field label="Default weight">
          <SegmentedControl
            value={weight}
            onValueChange={setWeight}
            options={WEIGHT_SEGMENTS}
            label="Default weight"
            className="w-full"
          />
        </Field>

        <Field
          label="Warmth"
          hint="How much it does against the cold. Material and weight adjust it per piece; the result decides which seasons a piece shows up in."
        >
          <HalfStepper value={warmth} onChange={setWarmth} label="warmth" />
        </Field>

        <Field
          label="Formality"
          hint="1 is the gym, 5 is black tie. It is matched against the occasion when outfits are generated."
        >
          <HalfStepper value={formality} onChange={setFormality} label="formality" />
        </Field>

        <ArtRow
          typeId={type?.slug ?? ""}
          artId={art?.id ?? null}
          source={art?.source ?? null}
          disabled={!type}
        />

        {type && onRequestDelete ? (
          <div className="pt-1">
            <Button
              variant="ghost"
              className="w-full text-destructive"
              onClick={() => onRequestDelete(type, usage)}
              disabled={pending}
            >
              Delete piece type
              {usage > 0 ? ` · ${usage} in your closet` : ""}
            </Button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
