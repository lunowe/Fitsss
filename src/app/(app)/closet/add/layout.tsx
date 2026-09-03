import type { ReactNode } from "react";
import { CartPill } from "@/components/closet/add/CartPill";
import { CartProvider } from "@/components/closet/add/CartProvider";

/**
 * The add flow's cart lives here so it survives navigation between the flow's
 * steps. The pill is rendered alongside every step.
 */
export default function AddLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      {children}
      <CartPill />
    </CartProvider>
  );
}
