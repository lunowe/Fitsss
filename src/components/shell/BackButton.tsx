"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * iOS-style back affordance for the LargeTitleHeader `leading` slot.
 * Prefers history.back() when the app navigated here; falls back to href.
 */
export function BackButton({ href, label = "Back", className }: { href: string; label?: string; className?: string }) {
  const router = useRouter();
  const classes = cn("-ml-2 flex h-11 items-center gap-0.5 pr-2 text-body text-tint active:opacity-60", className);
  return (
    <Link
      href={href}
      className={classes}
      onClick={(e) => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      <ChevronLeft size={26} strokeWidth={2.25} aria-hidden className="-ml-1" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
