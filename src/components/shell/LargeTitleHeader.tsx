"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * iOS-style large title. Renders a fixed top bar that is transparent while the
 * large title is visible and becomes a blurred bar with the inline title once
 * the large title scrolls out of view.
 */
export function LargeTitleHeader({
  title,
  subtitle,
  leading,
  trailing,
  children,
  className,
}: {
  title: string;
  /** Small secondary line under the large title, e.g. "25 pieces". */
  subtitle?: ReactNode;
  /** Left side of the inline bar (back button). */
  leading?: ReactNode;
  /** Right side of both the large and inline bar (actions). */
  trailing?: ReactNode;
  /** Content pinned under the header while collapsed, e.g. a filter row. */
  children?: ReactNode;
  className?: string;
}) {
  const barRow = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // The sentinel sits at the bottom edge of the large title, and the observer's
  // top margin is the measured bottom of the fixed nav row (44px plus whatever
  // the safe-area inset is on this device), so the swap happens exactly when the
  // large title disappears behind the bar — not on the first pixel of scroll.
  useEffect(() => {
    const target = sentinel.current;
    const rowEl = barRow.current;
    if (!target || !rowEl) return;

    let io: IntersectionObserver | undefined;
    let lastTop = -1;

    const attach = () => {
      // The row is inside a `fixed` bar, so its bottom is scroll-independent.
      const top = Math.round(rowEl.getBoundingClientRect().bottom);
      if (top === lastTop) return;
      lastTop = top;
      io?.disconnect();
      io = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
        rootMargin: `-${top}px 0px 0px 0px`,
      });
      io.observe(target);
    };

    attach();
    window.addEventListener("resize", attach);
    window.addEventListener("orientationchange", attach);
    return () => {
      io?.disconnect();
      window.removeEventListener("resize", attach);
      window.removeEventListener("orientationchange", attach);
    };
  }, []);

  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)] transition-colors duration-200",
          collapsed ? "border-b border-separator bg-bg/80 backdrop-blur-xl" : "border-b border-transparent",
        )}
      >
        <div ref={barRow} className="mx-auto flex h-11 w-full max-w-[480px] items-center px-4">
          <div className="flex min-w-11 items-center justify-start">{leading}</div>
          <div
            className={cn(
              "flex-1 truncate text-center text-headline transition-opacity duration-200",
              collapsed ? "opacity-100" : "opacity-0",
            )}
            // The <h1> below is the accessible title; this copy is decorative.
            aria-hidden
          >
            {title}
          </div>
          <div className="flex min-w-11 items-center justify-end">{trailing}</div>
        </div>
        {children ? (
          <div
            className={cn(
              "mx-auto w-full max-w-[480px] transition-opacity duration-200",
              collapsed ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {children}
          </div>
        ) : null}
      </div>

      <div className={cn("pt-[calc(env(safe-area-inset-top)+44px)]", className)}>
        <div className="px-4 pb-2 pt-1">
          <h1 className="text-large-title">{title}</h1>
          <div ref={sentinel} aria-hidden className="-mb-px h-px" />
          {subtitle ? <p className="mt-0.5 text-subhead text-label-2">{subtitle}</p> : null}
        </div>
        {children ? <div className={cn(collapsed ? "invisible" : "")}>{children}</div> : null}
      </div>
    </>
  );
}
