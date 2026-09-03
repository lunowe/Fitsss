"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { MAX_QUANTITY } from "./cart";

/**
 * Compact − / count / + stepper used in the cart review rows.
 * At a quantity of 1 the minus turns into a trash icon, because tapping it
 * removes the line.
 */
export function QuantityStepper({
  quantity,
  onChange,
  label,
}: {
  quantity: number;
  /** Called with the new quantity; 0 means "remove this line". */
  onChange: (quantity: number) => void;
  /** Accessible name of the thing being counted. */
  label: string;
}) {
  const atMin = quantity <= 1;
  return (
    <div className="flex h-11 items-center rounded-full bg-fill">
      <button
        type="button"
        aria-label={atMin ? `Remove ${label}` : `One fewer ${label}`}
        onClick={() => onChange(quantity - 1)}
        className="flex h-11 w-9 items-center justify-center rounded-l-full text-label transition-transform duration-150 ease-out active:scale-90"
      >
        {atMin ? <Trash2 size={16} strokeWidth={2} aria-hidden /> : <Minus size={18} strokeWidth={2.25} aria-hidden />}
      </button>
      <span className="min-w-5 text-center text-subhead font-medium tabular-nums text-label">{quantity}</span>
      <button
        type="button"
        aria-label={`One more ${label}`}
        disabled={quantity >= MAX_QUANTITY}
        onClick={() => onChange(quantity + 1)}
        className="flex h-11 w-9 items-center justify-center rounded-r-full text-label transition-transform duration-150 ease-out active:scale-90 disabled:opacity-40"
      >
        <Plus size={18} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
