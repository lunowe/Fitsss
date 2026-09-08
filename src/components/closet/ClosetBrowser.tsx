"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Chip, ChipRow, InsetGroup, LargeTitleHeader, Row, SectionHeader } from "@/components/shell";
import { categoryIdOf, getPieceType, listCategories, type Block } from "@/domain";

import { BlockTile } from "./BlockTile";
import { searchHaystack } from "./labels";

/**
 * The category a piece is filed under: its type's own category, which may be
 * one the user added. Falls back to the stored role for a type that is gone.
 */
function categoryOf(block: Block): string {
  const type = getPieceType(block.typeId);
  return type ? categoryIdOf(type) : block.category;
}

/**
 * The closet grid with its pinned category filter and inline search. Filtering
 * is client side over the blocks the server passed; the active category lives
 * in `?c=` so it survives a refresh or a shared link.
 */
export function ClosetBrowser({ blocks, archivedCount }: { blocks: Block[]; archivedCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const categories = listCategories();
  const order = new Map(categories.map((category, index) => [category.id, index]));
  const labels = new Map(categories.map((category) => [category.id, category.label]));

  const counts = new Map<string, number>();
  for (const block of blocks) {
    const id = categoryOf(block);
    counts.set(id, (counts.get(id) ?? 0) + block.quantity);
  }

  const requested = searchParams.get("c");
  const present = categories.filter((category) => (counts.get(category.id) ?? 0) > 0);
  const active: string =
    requested && present.some((category) => category.id === requested) ? requested : "all";

  const total = blocks.reduce((sum, block) => sum + block.quantity, 0);

  const trimmed = query.trim().toLowerCase();
  const scoped = active === "all" ? blocks : blocks.filter((block) => categoryOf(block) === active);
  const matches = [...(trimmed ? scoped.filter((block) => searchHaystack(block).includes(trimmed)) : scoped)].sort(
    (a, b) => (order.get(categoryOf(a)) ?? 99) - (order.get(categoryOf(b)) ?? 99),
  );

  const groups: { category: string; items: Block[] }[] = [];
  for (const block of matches) {
    const id = categoryOf(block);
    const last = groups.at(-1);
    if (last && last.category === id) last.items.push(block);
    else groups.push({ category: id, items: [block] });
  }

  function selectCategory(category: string) {
    const next = category === "all" ? pathname : `${pathname}?c=${category}`;
    router.replace(next, { scroll: false });
  }

  function toggleSearch() {
    if (searchOpen) setQuery("");
    setSearchOpen(!searchOpen);
  }

  return (
    <>
      <LargeTitleHeader
        title="Closet"
        subtitle={`${total} ${total === 1 ? "piece" : "pieces"}`}
        trailing={
          <button
            type="button"
            onClick={toggleSearch}
            aria-label={searchOpen ? "Close search" : "Search closet"}
            aria-expanded={searchOpen}
            className="-mr-2.5 flex size-11 items-center justify-center text-tint transition-opacity duration-150 active:opacity-60"
          >
            {searchOpen ? <X size={22} strokeWidth={2.25} /> : <Search size={21} strokeWidth={2} />}
          </button>
        }
      >
        <ChipRow className="pb-2.5 pt-1.5">
          <Chip selected={active === "all"} onClick={() => selectCategory("all")}>
            All
          </Chip>
          {present.map((category) => (
            <Chip
              key={category.id}
              selected={active === category.id}
              onClick={() => selectCategory(category.id)}
            >
              {category.label}
              <span className="tabular-nums opacity-60">{counts.get(category.id)}</span>
            </Chip>
          ))}
        </ChipRow>
      </LargeTitleHeader>

      {searchOpen ? (
        <div className="px-4 pb-3">
          <div className="flex h-10 items-center gap-2 rounded-[10px] bg-fill px-2.5">
            <Search size={17} className="shrink-0 text-label-2" aria-hidden />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your closet"
              aria-label="Search your closet"
              className="h-full min-w-0 flex-1 bg-transparent text-body text-label outline-none placeholder:text-label-3 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="-mr-1 flex size-8 shrink-0 items-center justify-center text-label-2 active:opacity-60"
              >
                <X size={17} strokeWidth={2.25} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="px-8 py-14 text-center text-callout text-label-2">
          {trimmed ? `No pieces match “${query.trim()}”.` : "Nothing here yet."}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.category}>
              {active === "all" ? (
                <SectionHeader>{labels.get(group.category) ?? group.category}</SectionHeader>
              ) : null}
              <div className="grid grid-cols-2 gap-3 px-4">
                {group.items.map((block) => (
                  <BlockTile key={block.id} block={block} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {archivedCount > 0 ? (
        <InsetGroup className="mx-4 mt-8">
          <Row
            href="/closet/archived"
            title="Archived"
            trailing={<span className="tabular-nums">{archivedCount}</span>}
          />
        </InsetGroup>
      ) : null}
    </>
  );
}
