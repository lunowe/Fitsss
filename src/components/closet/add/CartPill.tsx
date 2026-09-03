"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "./CartProvider";
import { CartSheet } from "./CartSheet";
import { useCountUp } from "./useCountUp";

/**
 * Floating cart pill. Sits above the tab bar, bottom right, and lifts clear of
 * the configurator's BottomBar — the one step in the flow that has one.
 */
export function CartPill() {
  const { count } = useCart();
  const [requestedOpen, setRequestedOpen] = useState(false);
  const countRef = useCountUp(count);
  const pathname = usePathname();

  // /closet/add/[category]/[typeId] is the only step with a sticky bottom bar.
  const lifted = pathname.split("/").filter(Boolean).length >= 4;
  const open = requestedOpen && count > 0;

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-[480px] justify-end px-4",
          lifted
            ? "bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+82px)]"
            : "bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+16px)]",
          count === 0 && "hidden",
        )}
      >
        <button
          // Remounting on every count change replays the scale-in.
          key={count}
          type="button"
          onClick={() => setRequestedOpen(true)}
          aria-label={`Cart, ${count} ${count === 1 ? "piece" : "pieces"}`}
          className="pointer-events-auto inline-flex h-11 animate-in items-center gap-2 rounded-full bg-ink px-4 text-ink-fg duration-200 ease-out zoom-in-90 active:scale-[0.96]"
        >
          <ShoppingBag size={18} strokeWidth={2} aria-hidden />
          <span className="text-subhead font-medium tabular-nums">
            Cart · <span ref={countRef}>{count}</span>
          </span>
        </button>
      </div>

      <CartSheet open={open} onOpenChange={setRequestedOpen} />
    </>
  );
}
