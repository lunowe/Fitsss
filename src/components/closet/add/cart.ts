/**
 * Cart model for the "add pieces" flow.
 *
 * The configurator produces a cartesian product of the attributes the user
 * picked (colors x fits/variants x materials). Each combination becomes a cart
 * line; adding an identical line again merges by incrementing its quantity.
 *
 * Pure TypeScript so it can be unit tested without a DOM.
 */

import {
  getPieceType,
  requirePieceType,
  type BlockColor,
  type BlockInput,
  type Category,
  type MaterialId,
  type Pattern,
  type Weight,
} from "@/domain";

/** A cart line's attributes: a BlockInput without its quantity. */
export type CartInput = Omit<BlockInput, "quantity">;

export interface CartLine {
  /** Stable identity of the attribute combination; see `lineKey`. */
  key: string;
  input: CartInput;
  quantity: number;
}

/** What the configurator holds while the user is choosing. */
export interface Draft {
  typeId: string;
  colors: BlockColor[];
  /** Fit ids for garments, variant ids for footwear and accessories. */
  options: string[];
  materials: MaterialId[];
  pattern: Pattern;
  weight?: Weight;
  nickname?: string;
  notes?: string;
}

export const MAX_QUANTITY = 99;

/** Identity of a color for selection state: palette id, or hex + name for customs. */
export function colorKey(color: BlockColor): string {
  return color.paletteId ? `p:${color.paletteId}` : `c:${color.hex}:${color.name.toLowerCase()}`;
}

/**
 * Stable identity of a cart line. Two inputs that differ in nothing a block
 * stores share a key and therefore merge into one line.
 */
export function lineKey(input: CartInput): string {
  return JSON.stringify([
    input.typeId,
    colorKey(input.color),
    input.secondaryColor ? colorKey(input.secondaryColor) : null,
    input.fit ?? null,
    input.variant ?? null,
    input.material ?? null,
    input.pattern,
    input.weight ?? null,
    input.nickname ?? null,
    input.notes ?? null,
  ]);
}

/** Expands a draft into one input per attribute combination. */
export function expandDraft(draft: Draft, usesFit: boolean): CartInput[] {
  const materials: (MaterialId | undefined)[] = draft.materials.length ? draft.materials : [undefined];
  const out: CartInput[] = [];
  for (const color of draft.colors) {
    for (const option of draft.options) {
      for (const material of materials) {
        const input: CartInput = { typeId: draft.typeId, color, pattern: draft.pattern };
        if (usesFit) input.fit = option;
        else input.variant = option;
        if (material) input.material = material;
        if (draft.weight) input.weight = draft.weight;
        if (draft.nickname) input.nickname = draft.nickname;
        if (draft.notes) input.notes = draft.notes;
        out.push(input);
      }
    }
  }
  return out;
}

/** How many pieces a draft would create. Correct when no material is picked. */
export function draftCount(draft: Draft): number {
  return draft.colors.length * draft.options.length * Math.max(draft.materials.length, 1);
}

/** Appends inputs to the cart, merging identical lines by quantity. */
export function addToCart(lines: readonly CartLine[], inputs: readonly CartInput[]): CartLine[] {
  const next = lines.map((line) => ({ ...line }));
  const positions = new Map(next.map((line, i) => [line.key, i]));
  for (const input of inputs) {
    const key = lineKey(input);
    const at = positions.get(key);
    if (at === undefined) {
      positions.set(key, next.length);
      next.push({ key, input, quantity: 1 });
    } else {
      next[at].quantity = Math.min(MAX_QUANTITY, next[at].quantity + 1);
    }
  }
  return next;
}

/** Sets a line's quantity. Anything below 1 removes the line. */
export function setLineQuantity(lines: readonly CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity < 1) return lines.filter((line) => line.key !== key);
  return lines.map((line) =>
    line.key === key ? { ...line, quantity: Math.min(MAX_QUANTITY, quantity) } : line,
  );
}

/** Total number of pieces in the cart. */
export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Cart lines as BlockInputs ready for `createBlocks`. */
export function cartInputs(lines: readonly CartLine[]): BlockInput[] {
  return lines.map((line) => ({ ...line.input, quantity: line.quantity }));
}

/** Groups lines by the catalog category of their piece type, in cart order. */
export function groupByCategory(lines: readonly CartLine[]): { category: Category; lines: CartLine[] }[] {
  const groups = new Map<Category, CartLine[]>();
  for (const line of lines) {
    const category = requirePieceType(line.input.typeId).category;
    const bucket = groups.get(category);
    if (bucket) bucket.push(line);
    else groups.set(category, [line]);
  }
  return [...groups].map(([category, grouped]) => ({ category, lines: grouped }));
}

function isColor(value: unknown): value is BlockColor {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return typeof c.hex === "string" && typeof c.name === "string" && typeof c.family === "string";
}

/**
 * Parses cart lines restored from sessionStorage. Anything unrecognisable is
 * dropped rather than throwing, so a stale payload can never break the flow.
 */
export function parseCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CartLine[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { input, quantity } = entry as { input?: unknown; quantity?: unknown };
    if (typeof input !== "object" || input === null) continue;
    const candidate = input as CartInput;
    if (typeof candidate.typeId !== "string" || !getPieceType(candidate.typeId)) continue;
    if (!isColor(candidate.color)) continue;
    if (typeof candidate.pattern !== "string") continue;
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1 || q > MAX_QUANTITY) continue;
    out.push({ key: lineKey(candidate), input: candidate, quantity: q });
  }
  return out;
}
