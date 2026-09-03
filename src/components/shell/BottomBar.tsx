import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sticky action bar pinned above the tab bar. Put the screen's primary
 * button here. Pages using it should add `pb-24` extra bottom padding.
 */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 z-30 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] bg-bg/80 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-[480px] items-center gap-3 px-4 pb-3 pt-2">{children}</div>
    </div>
  );
}
