"use client";

import { Minus, Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Chip, Swatch } from "@/components/shell";
import { Input } from "@/components/ui/input";
import { PALETTE, getPaletteColor } from "@/domain";
import { cn } from "@/lib/utils";

/** One labelled block inside a sheet, with an optional explanatory footnote. */
export function Field({
  label,
  hint,
  trailing,
  children,
}: {
  label: string;
  hint?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-footnote font-medium uppercase tracking-[0.4px] text-label-2">{label}</p>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      {children}
      {hint ? <p className="mt-1.5 text-footnote text-label-2">{hint}</p> : null}
    </section>
  );
}

/** Read-only list of values, for the built-in piece type sheet. */
export function ValueList({ values, empty = "—" }: { values: string[]; empty?: string }) {
  if (values.length === 0) return <p className="text-callout text-label-2">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span key={value} className="rounded-full bg-fill px-3 py-1.5 text-subhead text-label">
          {value}
        </span>
      ))}
    </div>
  );
}

/**
 * Chips with an × plus a text field. Suggestions come from the vocabulary the
 * role already uses, so a new type reads like the built-in ones.
 */
export function TagEditor({
  values,
  onChange,
  suggestions,
  placeholder,
  max,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  placeholder: string;
  max: number;
}) {
  const [draft, setDraft] = useState("");
  const unused = suggestions.filter((s) => !values.includes(s));
  const full = values.length >= max;

  function add(raw: string) {
    const value = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!value || values.includes(value) || full) return;
    onChange([...values, value]);
    setDraft("");
  }

  return (
    <div className="space-y-2.5">
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full bg-ink py-1.5 pl-3 pr-1.5 text-subhead font-medium text-ink-fg"
            >
              {value}
              <button
                type="button"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="flex size-5 items-center justify-center rounded-full bg-ink-fg/20 active:opacity-60"
              >
                <X size={12} strokeWidth={2.5} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add(draft);
            }
          }}
          placeholder={placeholder}
          maxLength={24}
          autoCapitalize="none"
          autoCorrect="off"
          disabled={full}
          className="text-body"
        />
        <button
          type="button"
          aria-label="Add"
          disabled={!draft.trim() || full}
          onClick={() => add(draft)}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-fill text-tint disabled:text-label-3"
        >
          <Plus size={20} aria-hidden />
        </button>
      </div>

      {unused.length > 0 && !full ? (
        <div className="flex flex-wrap gap-1.5">
          {unused.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => add(suggestion)}
              className="rounded-full border border-dashed border-separator px-3 py-1.5 text-subhead text-label-2 active:opacity-60"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Wrapping chip group where more than one value can be on at a time. */
export function ChipMultiSelect({
  options,
  selected,
  onToggle,
  locked = [],
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Values that are always on and cannot be turned off. */
  locked?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isLocked = locked.includes(option.value);
        return (
          <Chip
            key={option.value}
            // Locked values stay ink-filled rather than greyed: they are on,
            // not unavailable.
            selected={isLocked || selected.includes(option.value)}
            aria-disabled={isLocked || undefined}
            onClick={isLocked ? undefined : () => onToggle(option.value)}
          >
            {option.label}
          </Chip>
        );
      })}
    </div>
  );
}

/** Palette swatches; the first ones are what the add flow offers up front. */
export function ColorPicker({
  selected,
  onToggle,
  max,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  max: number;
}) {
  return (
    <div className="space-y-2.5">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((id) => {
            const color = getPaletteColor(id);
            if (!color) return null;
            return (
              <Swatch
                key={id}
                hex={color.hex}
                label={`Remove ${color.name}`}
                selected
                size={30}
                onClick={() => onToggle(id)}
              />
            );
          })}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {PALETTE.filter((color) => !selected.includes(color.id)).map((color) => (
          <Swatch
            key={color.id}
            hex={color.hex}
            label={color.name}
            size={26}
            disabled={selected.length >= max}
            onClick={() => onToggle(color.id)}
            className={selected.length >= max ? "opacity-30" : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** 0 to 5 in half steps, the scale warmth and formality are derived on. */
export function HalfStepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const set = (next: number) => onChange(Math.min(5, Math.max(0, Math.round(next * 2) / 2)));
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 items-center rounded-[9px] bg-fill">
        <button
          type="button"
          aria-label={`Less ${label}`}
          onClick={() => set(value - 0.5)}
          disabled={value <= 0}
          className="flex h-9 w-11 items-center justify-center rounded-l-[9px] text-tint active:opacity-50 disabled:text-label-3"
        >
          <Minus size={18} aria-hidden />
        </button>
        <span className="w-10 text-center text-headline tabular-nums">{value.toFixed(1)}</span>
        <button
          type="button"
          aria-label={`More ${label}`}
          onClick={() => set(value + 0.5)}
          disabled={value >= 5}
          className="flex h-9 w-11 items-center justify-center rounded-r-[9px] text-tint active:opacity-50 disabled:text-label-3"
        >
          <Plus size={18} aria-hidden />
        </button>
      </div>
      <span className="flex items-center gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn(
              "size-1.5 rounded-full",
              value >= step ? "bg-label" : value >= step - 0.5 ? "bg-label-2" : "bg-label-3",
            )}
          />
        ))}
      </span>
    </div>
  );
}
