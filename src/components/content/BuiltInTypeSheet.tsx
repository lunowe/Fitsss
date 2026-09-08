"use client";

import { Sheet } from "@/components/shell";
import {
  PATTERN_LABELS,
  WEIGHT_LABELS,
  fitLabel,
  getMaterial,
  variantLabel,
  type PieceType,
} from "@/domain";
import type { PieceArtRecord } from "@/server/content-queries";

import { ArtRow } from "./ArtRow";
import { Field, ValueList } from "./fields";

/**
 * A built-in piece type, read only. Its vocabulary ships with the app, but the
 * drawing is still the user's to replace.
 */
export function BuiltInTypeSheet({
  type,
  art,
  open,
  onOpenChange,
}: {
  type: PieceType | null;
  art: PieceArtRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!type) return null;
  const garment = type.fitOptions !== undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={type.label} description="Built in">
      <div className="space-y-7 pb-2 pt-2">
        <Field label={garment ? "Fits" : "Styles"}>
          <ValueList
            values={(garment ? type.fitOptions : type.variantOptions)?.map(
              garment ? fitLabel : variantLabel,
            ) ?? []}
          />
        </Field>

        <Field label="Materials">
          <ValueList values={type.materialOptions.map((id) => getMaterial(id).label)} />
        </Field>

        <Field label="Patterns">
          <ValueList values={type.patternOptions.map((pattern) => PATTERN_LABELS[pattern])} />
        </Field>

        <Field label="Defaults">
          <ValueList
            values={[
              `${WEIGHT_LABELS[type.defaultWeight]} weight`,
              `Warmth ${type.baseWarmth}`,
              `Formality ${type.baseFormality}`,
            ]}
          />
        </Field>

        <ArtRow typeId={type.id} artId={art?.id ?? null} source={art?.source ?? null} />
      </div>
    </Sheet>
  );
}
