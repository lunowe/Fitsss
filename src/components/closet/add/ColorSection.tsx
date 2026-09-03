"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { SectionHeader, Swatch, SwatchDot } from "@/components/shell";
import {
  COLOR_FAMILIES,
  COLOR_FAMILY_LABELS,
  getPaletteColor,
  paletteByFamily,
  paletteToBlockColor,
  type BlockColor,
} from "@/domain";
import { cn } from "@/lib/utils";
import { colorKey } from "./cart";
import { CustomColorSheet } from "./CustomColorSheet";

const BY_FAMILY = paletteByFamily();

/**
 * Multi-select colour picker: the type's suggested colours first, then the
 * whole palette grouped by family, then an escape hatch for custom colours.
 */
export function ColorSection({
  suggested,
  selected,
  onToggle,
  onAddCustom,
}: {
  /** Palette ids the catalog suggests for this piece type. */
  suggested: readonly string[];
  selected: BlockColor[];
  onToggle: (color: BlockColor) => void;
  onAddCustom: (color: BlockColor) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const selectedKeys = new Set(selected.map(colorKey));
  const suggestedColors = suggested.map(getPaletteColor).filter((c) => c !== undefined);
  const customs = selected.filter((c) => !c.paletteId);

  return (
    <section>
      <SectionHeader>Colors</SectionHeader>

      <div className="mx-4 space-y-5 rounded-xl bg-card p-4">
        {selected.length ? (
          <div>
            <p className="mb-2 text-caption text-label-2">Selected</p>
            <div className="flex flex-wrap gap-2">
              {selected.map((color) => (
                <button
                  key={colorKey(color)}
                  type="button"
                  onClick={() => onToggle(color)}
                  aria-label={`Remove ${color.name}`}
                  className="inline-flex h-[34px] items-center gap-1.5 rounded-full bg-fill pl-2 pr-2.5 text-subhead text-label transition-transform duration-150 ease-out active:scale-[0.97]"
                >
                  <SwatchDot hex={color.hex} size={16} />
                  <span className="max-w-[10ch] truncate">{color.name}</span>
                  <X size={14} strokeWidth={2.25} className="text-label-2" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {suggestedColors.length ? (
          <div>
            <p className="mb-2 text-caption text-label-2">Suggested</p>
            <div className="flex flex-wrap gap-3">
              {suggestedColors.map((c) => (
                <Swatch
                  key={c.id}
                  hex={c.hex}
                  label={c.name}
                  selected={selectedKeys.has(`p:${c.id}`)}
                  onClick={() => onToggle(paletteToBlockColor(c.id))}
                />
              ))}
            </div>
          </div>
        ) : null}

        {COLOR_FAMILIES.map((family) => {
          const colors = BY_FAMILY[family];
          if (!colors?.length) return null;
          return (
            <div key={family}>
              <p className="mb-2 text-caption text-label-2">{COLOR_FAMILY_LABELS[family]}</p>
              <div className="grid grid-cols-5 gap-x-2 gap-y-3">
                {colors.map((c) => (
                  <div key={c.id} className="flex min-w-0 flex-col items-center gap-1">
                    <Swatch
                      hex={c.hex}
                      label={c.name}
                      selected={selectedKeys.has(`p:${c.id}`)}
                      onClick={() => onToggle(paletteToBlockColor(c.id))}
                    />
                    <span className="w-full truncate text-center text-caption text-label-2">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div>
          <p className="mb-2 text-caption text-label-2">Custom</p>
          <div className="grid grid-cols-5 gap-x-2 gap-y-3">
            {customs.map((c) => (
              <div key={colorKey(c)} className="flex min-w-0 flex-col items-center gap-1">
                <Swatch hex={c.hex} label={c.name} selected onClick={() => onToggle(c)} />
                <span className="w-full truncate text-center text-caption text-label-2">{c.name}</span>
              </div>
            ))}
            <div className="flex min-w-0 flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                aria-label="Add a custom color"
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border border-dashed border-label-3 text-label-2",
                  "transition-transform duration-150 ease-out active:scale-95",
                )}
              >
                <Plus size={18} strokeWidth={2} aria-hidden />
              </button>
              <span className="w-full truncate text-center text-caption text-label-2">Custom</span>
            </div>
          </div>
        </div>
      </div>

      <CustomColorSheet open={customOpen} onOpenChange={setCustomOpen} onAdd={onAddCustom} />
    </section>
  );
}
