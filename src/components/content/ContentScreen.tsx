"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, Images, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  Chip,
  ChipRow,
  InsetGroup,
  Row,
  SectionFooter,
  SectionHeader,
  Sheet,
} from "@/components/shell";
import { Silhouette } from "@/components/silhouettes";
import { Button } from "@/components/ui/button";
import { listCategories, pieceTypesForCategoryId, type PieceType } from "@/domain";
import {
  archiveCustomCategory,
  archiveCustomPieceType,
  reorderCustomCategories,
  reorderCustomPieceTypes,
} from "@/server/content";
import type {
  CustomCategoryRecord,
  CustomPieceTypeRecord,
  PieceArtRecord,
} from "@/server/content-queries";

import { BuiltInTypeSheet } from "./BuiltInTypeSheet";
import { CategorySheet } from "./CategorySheet";
import { PieceTypeSheet } from "./PieceTypeSheet";

function ReorderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-lg text-tint transition-opacity duration-150 active:opacity-50 disabled:text-label-3"
    >
      {children}
    </button>
  );
}

/** A row the user can open, reorder and delete. */
function EditableRow({
  title,
  subtitle,
  leading,
  index,
  total,
  pending,
  onOpen,
  onMove,
}: {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  index: number;
  total: number;
  pending: boolean;
  onOpen: () => void;
  onMove: (delta: number) => void;
}) {
  return (
    <div className="pl-4">
      <div className="flex min-h-11 items-center gap-2 py-1.5 pr-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left transition-opacity duration-100 active:opacity-60"
        >
          {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body text-label">{title}</span>
            {subtitle ? (
              <span className="block truncate text-subhead text-label-2">{subtitle}</span>
            ) : null}
          </span>
          <ChevronRight size={18} className="shrink-0 text-label-3" aria-hidden />
        </button>
        <div className="flex shrink-0 items-center">
          <ReorderButton
            label={`Move ${title} up`}
            disabled={index === 0 || pending}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={18} strokeWidth={2} aria-hidden />
          </ReorderButton>
          <ReorderButton
            label={`Move ${title} down`}
            disabled={index === total - 1 || pending}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={18} strokeWidth={2} aria-hidden />
          </ReorderButton>
        </div>
      </div>
    </div>
  );
}

type Confirm =
  | { kind: "category"; category: CustomCategoryRecord }
  | { kind: "type"; type: CustomPieceTypeRecord; usage: number };

/**
 * The Content screen: the catalog as data. Built-in entries are shown so the
 * vocabulary is legible, and everything the user added is editable in place.
 */
export function ContentScreen({
  categories,
  types,
  art,
  usage,
  builtInArtCount,
}: {
  categories: CustomCategoryRecord[];
  types: CustomPieceTypeRecord[];
  art: PieceArtRecord[];
  usage: Record<string, number>;
  builtInArtCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selectedCategory, setSelectedCategory] = useState<string>("top");
  const [categorySheet, setCategorySheet] = useState<CustomCategoryRecord | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [typeSheet, setTypeSheet] = useState<CustomPieceTypeRecord | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [builtIn, setBuiltIn] = useState<PieceType | null>(null);
  const [builtInOpen, setBuiltInOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // Bumped on every open so a sheet remounts and re-seeds its fields.
  const [session, setSession] = useState(0);

  const allCategories = listCategories();
  const customById = new Map(types.map((type) => [type.slug, type]));
  const artByType = new Map(art.filter((row) => !row.variant).map((row) => [row.typeId, row]));
  const active = allCategories.find((category) => category.id === selectedCategory) ?? allCategories[0];
  const shown = pieceTypesForCategoryId(active.id);

  function openCategory(category: CustomCategoryRecord | null) {
    setCategorySheet(category);
    setSession((n) => n + 1);
    setCategoryOpen(true);
  }

  function openType(type: CustomPieceTypeRecord | null) {
    setTypeSheet(type);
    setSession((n) => n + 1);
    setTypeOpen(true);
  }

  function openBuiltIn(type: PieceType) {
    setBuiltIn(type);
    setSession((n) => n + 1);
    setBuiltInOpen(true);
  }

  function moveCategory(index: number, delta: number) {
    const next = [...categories];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(async () => {
      const result = await reorderCustomCategories(next.map((category) => category.id));
      if (!result.ok) {
        toast("Could not reorder your categories");
        return;
      }
      router.refresh();
    });
  }

  function moveType(list: CustomPieceTypeRecord[], index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    // Types outside this category keep their place; the action fills the rest in.
    const order = [...next, ...types.filter((type) => !next.includes(type))];
    startTransition(async () => {
      const result = await reorderCustomPieceTypes(order.map((type) => type.id));
      if (!result.ok) {
        toast("Could not reorder your piece types");
        return;
      }
      router.refresh();
    });
  }

  function remove(target: Confirm) {
    startTransition(async () => {
      const result =
        target.kind === "category"
          ? await archiveCustomCategory(target.category.id)
          : await archiveCustomPieceType(target.type.id);
      if (!result.ok) {
        toast(result.errors[0] ?? "Could not delete that");
        setConfirm(null);
        return;
      }
      setConfirm(null);
      toast(target.kind === "category" ? "Category deleted" : "Piece type deleted");
      router.refresh();
    });
  }

  const customInCategory = types.filter((type) => type.categoryId === active.id);

  return (
    <div className="space-y-8 pt-2">
      {/* -------------------------------------------------- Categories */}
      <section>
        <SectionHeader>Categories</SectionHeader>
        <InsetGroup className="mx-4">
          {allCategories
            .filter((category) => !category.custom)
            .map((category) => (
              <Row
                key={category.id}
                title={category.label}
                subtitle={category.hint}
                trailing={<span className="text-footnote">Built in</span>}
              />
            ))}
          {categories.map((category, index) => (
            <EditableRow
              key={category.id}
              title={category.label}
              subtitle={category.hint || `Behaves like ${category.role}`}
              index={index}
              total={categories.length}
              pending={pending}
              onOpen={() => openCategory(category)}
              onMove={(delta) => moveCategory(index, delta)}
            />
          ))}
          <Row title="New category" onClick={() => openCategory(null)} chevron={false} leading={<Plus size={18} className="text-tint" aria-hidden />} />
        </InsetGroup>
        <SectionFooter>
          A category of your own still behaves like one of the seven built-in ones — that is what
          keeps outfits and weather working.
        </SectionFooter>
      </section>

      {/* -------------------------------------------------- Piece types */}
      <section>
        <SectionHeader>Piece types</SectionHeader>
        <ChipRow className="pb-2.5 pt-0">
          {allCategories.map((category) => (
            <Chip
              key={category.id}
              selected={active.id === category.id}
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.label}
            </Chip>
          ))}
        </ChipRow>
        <InsetGroup className="mx-4">
          {shown.map((type) => {
            const custom = customById.get(type.id);
            if (!custom) {
              return (
                <Row
                  key={type.id}
                  onClick={() => openBuiltIn(type)}
                  leading={<Silhouette typeId={type.id} color="var(--color-label-3)" size={28} />}
                  title={type.label}
                  trailing={
                    <span className="text-footnote">
                      {artByType.has(type.id) ? "Your art" : "Built in"}
                    </span>
                  }
                />
              );
            }
            const index = customInCategory.findIndex((row) => row.id === custom.id);
            return (
              <EditableRow
                key={type.id}
                title={type.label}
                subtitle={
                  usage[type.id]
                    ? `${usage[type.id]} in your closet`
                    : (type.fitOptions ?? type.variantOptions ?? []).join(", ")
                }
                leading={<Silhouette typeId={type.id} color="var(--color-label-3)" size={28} />}
                index={index}
                total={customInCategory.length}
                pending={pending}
                onOpen={() => openType(custom)}
                onMove={(delta) => moveType(customInCategory, index, delta)}
              />
            );
          })}
          <Row
            title={`New piece type in ${active.label}`}
            onClick={() => openType(null)}
            chevron={false}
            leading={<Plus size={18} className="text-tint" aria-hidden />}
          />
        </InsetGroup>
      </section>

      {/* -------------------------------------------------- Artwork */}
      <section>
        <SectionHeader>Artwork</SectionHeader>
        <InsetGroup className="mx-4">
          <Row
            title="Drawings"
            trailing={
              <span className="tabular-nums">
                {builtInArtCount} built in · {art.length} custom
              </span>
            }
          />
          <Row
            href="/dev/silhouettes"
            title="Preview all"
            leading={<Images size={18} className="text-tint" aria-hidden />}
          />
        </InsetGroup>
        <SectionFooter>
          An uploaded SVG is rewritten so the piece takes on its own colour: the colour it uses most
          becomes the garment, outlines become ink.
        </SectionFooter>
      </section>

      {/* -------------------------------------------------- Sheets */}
      <CategorySheet
        key={`category-${session}`}
        category={categorySheet}
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        onRequestDelete={(category) => {
          setCategoryOpen(false);
          setConfirm({ kind: "category", category });
        }}
      />

      <PieceTypeSheet
        key={`type-${session}`}
        type={typeSheet}
        defaultCategoryId={active.id}
        art={typeSheet ? (artByType.get(typeSheet.slug) ?? null) : null}
        usage={typeSheet ? (usage[typeSheet.slug] ?? 0) : 0}
        open={typeOpen}
        onOpenChange={setTypeOpen}
        onRequestDelete={(type, count) => {
          setTypeOpen(false);
          setConfirm({ kind: "type", type, usage: count });
        }}
      />

      <BuiltInTypeSheet
        key={`built-in-${session}`}
        type={builtIn}
        art={builtIn ? (artByType.get(builtIn.id) ?? null) : null}
        open={builtInOpen}
        onOpenChange={setBuiltInOpen}
      />

      <Sheet
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={
          confirm
            ? `Delete ${confirm.kind === "category" ? confirm.category.label : confirm.type.label}?`
            : "Delete"
        }
      >
        <p className="text-callout text-label-2">
          {confirm?.kind === "type" && confirm.usage > 0
            ? `${confirm.usage} ${confirm.usage === 1 ? "piece" : "pieces"} in your closet ${confirm.usage === 1 ? "is" : "are"} still one of these. Archive ${confirm.usage === 1 ? "it" : "them"} first.`
            : "Pieces already in your closet keep working. Only the entry goes away."}
        </p>
        <div className="mt-5 space-y-2 pb-2">
          <Button
            variant="destructive"
            className="w-full"
            disabled={pending}
            onClick={() => confirm && remove(confirm)}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
