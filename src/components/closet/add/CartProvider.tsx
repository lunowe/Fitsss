"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { cartCount, type CartInput, type CartLine } from "./cart";
import {
  addLines,
  clearCart,
  getServerSnapshot,
  getSnapshot,
  keepOnlyLines,
  subscribe,
  updateQuantity,
} from "./cartStore";

interface CartContextValue {
  lines: CartLine[];
  /** Total pieces, i.e. the sum of every line's quantity. */
  count: number;
  add: (inputs: CartInput[]) => void;
  setQuantity: (key: string, quantity: number) => void;
  keepOnly: (keys: string[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Exposes the add-flow cart to every step of the flow. Mounted by the
 * /closet/add layout so the cart survives navigation between steps; the
 * backing store mirrors it into sessionStorage so a refresh keeps it too.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const lines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: cartCount(lines),
      add: addLines,
      setQuantity: updateQuantity,
      keepOnly: keepOnlyLines,
      clear: clearCart,
    }),
    [lines],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside a CartProvider");
  return value;
}
