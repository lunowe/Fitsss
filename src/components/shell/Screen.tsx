import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll container for a tab screen. Reserves space for the tab bar (and an
 * optional BottomBar) so content never hides behind fixed chrome.
 */
export function Screen({
  children,
  className,
  hasBottomBar = false,
}: {
  children: ReactNode;
  className?: string;
  hasBottomBar?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[480px]",
        hasBottomBar
          ? "pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+88px)]"
          : "pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+16px)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
