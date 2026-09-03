"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Chip, Sheet, Swatch, SegmentedControl } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COLOR_FAMILIES,
  COLOR_FAMILY_LABELS,
  PATTERN_LABELS,
  WEIGHTS,
  WEIGHT_LABELS,
  customColor,
  fitLabel,
  getMaterial,
  getPaletteColor,
  isGarment,
  paletteByFamily,
  paletteToBlockColor,
  requirePieceType,
  variantLabel,
  type Block,
  type BlockColor,
  type BlockInput,
  type MaterialId,
  type Pattern,
  type Weight,
} from "@/domain";
import { updateBlock } from "@/server/blocks";

import { sentenceCase } from "./labels";

/** One labelled control block inside the sheet. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-footnote font-medium uppercase tracking-[0.4px] text-label-2">{label}</p>
      {children}
    </section>
  );
}


function SwatchRow({
  ids,
  value,
  onChange,
}: {
  ids: readonly string[];
  value: BlockColor;
  onChange: (color: BlockColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {ids.map((id) => {
        const color = getPaletteColor(id);
        if (!color) return null;
        return (
          <Swatch
            key={id}
            hex={color.hex}
            label={color.name}
            selected={value.paletteId === id}
            onClick={() => onChange(paletteToBlockColor(id))}
            // Every swatch keeps a hairline so near-black reads on a dark card.
            className="ring-1 ring-inset ring-separator"
          />
        );
      })}
    </div>
  );
}

/** Palette grid: the type's suggested colors first, then every family. */
function ColorPicker({
  value,
  onChange,
  suggested,
}: {
  value: BlockColor;
  onChange: (color: BlockColor) => void;
  suggested?: readonly string[];
}) {
  const families = paletteByFamily();
  const [name, setName] = useState(value.paletteId ? "" : value.name);
  const [hex, setHex] = useState(value.paletteId ? "" : value.hex);

  function applyCustom(nextName: string, nextHex: string) {
    setName(nextName);
    setHex(nextHex);
    const custom = customColor(nextName, nextHex);
    if (custom) onChange(custom);
  }

  return (
    <div className="space-y-3.5">
      {suggested?.length ? (
        <div>
          <p className="mb-1.5 text-caption text-label-2">Suggested</p>
          <SwatchRow ids={suggested} value={value} onChange={onChange} />
        </div>
      ) : null}
      {COLOR_FAMILIES.map((family) => (
        <div key={family}>
          <p className="mb-1.5 text-caption text-label-2">{COLOR_FAMILY_LABELS[family]}</p>
          <SwatchRow
            ids={(families[family] ?? []).map((color) => color.id)}
            value={value}
            onChange={onChange}
          />
        </div>
      ))}
      <div>
        <p className="mb-1.5 text-caption text-label-2">Custom</p>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(event) => applyCustom(event.target.value, hex)}
            placeholder="Name"
            aria-label="Custom color name"
            maxLength={40}
            className="flex-1 text-body"
          />
          <Input
            value={hex}
            onChange={(event) => applyCustom(name, event.target.value)}
            placeholder="#7a5230"
            aria-label="Custom color hex"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={7}
            className="w-[104px] text-body tabular-nums"
          />
          <span
            aria-hidden
            className="size-9 shrink-0 rounded-full ring-1 ring-inset ring-separator"
            style={{ background: customColor(name, hex)?.hex ?? "var(--color-fill)" }}
          />
        </div>
      </div>
    </div>
  );
}

function QuantityStepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div className="flex h-11 w-fit items-center rounded-xl bg-fill">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
        className="flex size-11 items-center justify-center text-label transition-opacity duration-150 active:opacity-50 disabled:opacity-30"
      >
        <Minus size={18} strokeWidth={2.25} />
      </button>
      <span className="w-9 text-center text-body font-medium tabular-nums text-label">{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={value >= 99}
        onClick={() => onChange(Math.min(99, value + 1))}
        className="flex size-11 items-center justify-center text-label transition-opacity duration-150 active:opacity-50 disabled:opacity-30"
      >
        <Plus size={18} strokeWidth={2.25} />
      </button>
    </div>
  );
}

/**
 * Edits one block. The piece type is fixed — every vocabulary here comes from
 * that type's catalog entry, so changing the type means removing and re-adding.
 *
 * State is seeded from `block` at mount, so the caller remounts this (via a
 * changing `key`) each time the sheet opens to drop a cancelled edit.
 */
export function EditBlockSheet({
  block,
  open,
  onOpenChange,
}: {
  block: Block;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const type = requirePieceType(block.typeId);
  const garment = isGarment(type);

  const [color, setColor] = useState<BlockColor>(block.color);
  const [secondary, setSecondary] = useState<BlockColor | undefined>(block.secondaryColor);
  const [fit, setFit] = useState(block.fit ?? "");
  const [variant, setVariant] = useState(block.variant ?? "");
  const [material, setMaterial] = useState<MaterialId | undefined>(block.material);
  const [pattern, setPattern] = useState<Pattern>(block.pattern);
  const [weight, setWeight] = useState<Weight>(block.effectiveWeight);
  const [quantity, setQuantity] = useState(block.quantity);
  const [nickname, setNickname] = useState(block.nickname ?? "");
  const [notes, setNotes] = useState(block.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const patterns: readonly Pattern[] = type.patternOptions.includes("solid")
    ? type.patternOptions
    : ["solid", ...type.patternOptions];

  function save() {
    const input: BlockInput = {
      typeId: block.typeId,
      color,
      secondaryColor: secondary,
      fit: garment ? fit : undefined,
      variant: garment ? undefined : variant,
      material,
      pattern,
      weight: garment ? weight : block.weight,
      quantity,
      nickname: nickname.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    startTransition(async () => {
      const result = await updateBlock(block.id, input);
      if (!result.ok) {
        setError(result.errors[0] ?? "Could not save this piece");
        return;
      }
      onOpenChange(false);
      toast("Saved");
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Edit"
      description={sentenceCase(block.label)}
      className="h-[88vh]"
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
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} suggested={type.suggestedColors} />
        </Field>

        <Field label="Second color">
          {secondary ? (
            <div className="space-y-3">
              <ColorPicker value={secondary} onChange={setSecondary} />
              <Button variant="ghost" size="sm" className="px-0" onClick={() => setSecondary(undefined)}>
                Remove second color
              </Button>
            </div>
          ) : (
            <Chip onClick={() => setSecondary(paletteToBlockColor("white"))} leading={<Plus size={15} />}>
              Second color
            </Chip>
          )}
        </Field>

        {garment ? (
          <Field label="Fit">
            <div className="flex flex-wrap gap-2">
              {type.fitOptions?.map((option) => (
                <Chip key={option} selected={fit === option} onClick={() => setFit(option)}>
                  {fitLabel(option)}
                </Chip>
              ))}
            </div>
          </Field>
        ) : (
          <Field label="Style">
            <div className="flex flex-wrap gap-2">
              {type.variantOptions?.map((option) => (
                <Chip key={option} selected={variant === option} onClick={() => setVariant(option)}>
                  {variantLabel(option)}
                </Chip>
              ))}
            </div>
          </Field>
        )}

        <Field label="Material">
          <div className="flex flex-wrap gap-2">
            <Chip selected={material === undefined} onClick={() => setMaterial(undefined)}>
              None
            </Chip>
            {type.materialOptions.map((option) => (
              <Chip key={option} selected={material === option} onClick={() => setMaterial(option)}>
                {getMaterial(option).label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Pattern">
          <div className="flex flex-wrap gap-2">
            {patterns.map((option) => (
              <Chip key={option} selected={pattern === option} onClick={() => setPattern(option)}>
                {PATTERN_LABELS[option]}
              </Chip>
            ))}
          </div>
        </Field>

        {garment ? (
          <Field label="Weight">
            <SegmentedControl
              label="Weight"
              value={weight}
              onValueChange={setWeight}
              options={WEIGHTS.map((option) => ({ value: option, label: WEIGHT_LABELS[option] }))}
            />
          </Field>
        ) : null}

        <Field label="Quantity">
          <QuantityStepper value={quantity} onChange={setQuantity} />
        </Field>

        <Field label="Nickname">
          <Input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Uniqlo U"
            maxLength={60}
            className="text-body"
          />
        </Field>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Collar stretches, only wear it under a layer."
            maxLength={500}
            className="text-body"
          />
        </Field>
      </div>
    </Sheet>
  );
}
