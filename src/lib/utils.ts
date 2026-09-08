import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type roles from DESIGN.md (`text-headline`, `text-subhead`, …) are
 * custom utilities that set font size, line height and weight. tailwind-merge
 * has to know they are font-size classes; otherwise it files them under text
 * colour and "resolves" `text-subhead text-primary-foreground` by dropping the
 * colour, which turns a small primary button black on black.
 */
const TYPE_ROLES = [
  "large-title",
  "title-1",
  "title-2",
  "title-3",
  "headline",
  "body",
  "callout",
  "subhead",
  "footnote",
  "caption",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TYPE_ROLES }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
