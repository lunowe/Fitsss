"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, LayoutGrid, Shirt, Sun, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS: readonly { href: string; label: string; Icon: typeof Sun; also?: readonly string[] }[] = [
  { href: "/today", label: "Today", Icon: Sun },
  { href: "/closet", label: "Closet", Icon: Shirt },
  // Inspo pictures and trips are shelves of Looks: their pages keep it lit.
  { href: "/looks", label: "Looks", Icon: LayoutGrid, also: ["/inspo", "/trips"] },
  { href: "/styles", label: "Styles", Icon: BookMarked },
  { href: "/you", label: "You", Icon: User },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-separator bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <ul className="mx-auto flex h-[var(--tabbar-h)] w-full max-w-[480px] items-stretch">
        {TABS.map(({ href, label, Icon, also = [] }) => {
          const active = [href, ...also].some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 transition-colors duration-150 active:opacity-70",
                  active ? "text-tint" : "text-label-2",
                )}
              >
                <Icon size={24} strokeWidth={active ? 2 : 1.75} aria-hidden />
                <span className="text-[10px] font-medium leading-3">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
