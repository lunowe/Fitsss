/**
 * The add-flow cart as a tiny external store.
 *
 * It is read through `useSyncExternalStore` rather than kept in component
 * state: sessionStorage can only be read on the client, and an external store
 * is how React wants that read expressed without an effect that sets state
 * during hydration.
 */

import { addToCart, cartCount, parseCart, setLineQuantity, type CartInput, type CartLine } from "./cart";

const STORAGE_KEY = "fitsss-cart";

/** Stable empty snapshot so the server render never allocates a new array. */
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? parseCart(JSON.parse(raw)) : EMPTY;
  } catch {
    // A corrupt or unavailable payload just means an empty cart.
    return EMPTY;
  }
}

function persist() {
  try {
    if (lines.length) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable (private mode); the cart still works in memory.
  }
}

function commit(next: CartLine[]) {
  lines = next;
  persist();
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  if (!hydrated) {
    hydrated = true;
    lines = read();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): CartLine[] {
  return lines;
}

export function getServerSnapshot(): CartLine[] {
  return EMPTY;
}

export function addLines(inputs: CartInput[]): void {
  commit(addToCart(lines, inputs));
}

export function updateQuantity(key: string, quantity: number): void {
  commit(setLineQuantity(lines, key, quantity));
}

/** Drops every line whose key is not listed. Used to keep server-rejected lines. */
export function keepOnlyLines(keys: string[]): void {
  const keep = new Set(keys);
  commit(lines.filter((line) => keep.has(line.key)));
}

export function clearCart(): void {
  commit(EMPTY);
}

export function count(): number {
  return cartCount(lines);
}
