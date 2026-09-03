"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  BackButton,
  BottomBar,
  Chip,
  LargeTitleHeader,
  Row,
  Screen,
  SectionFooter,
  SectionHeader, SegmentedControl } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORY_LABELS,
  PATTERN_LABELS,
  WEIGHTS,
  WEIGHT_LABELS,
  fitLabel,
  getMaterial,
  variantLabel,
  type BlockColor,
  type MaterialId,
  type Pattern,
  type PieceType,
  type Weight,
} from "@/domain";
import { cn } from "@/lib/utils";
import { colorKey, draftCount, expandDraft, type Draft } from "./cart";
import { useCart } from "./CartProvider";
import { ColorSection } from "./ColorSection";


const WEIGHT_SEGMENTS = WEIGHTS.map((w) => ({ value: w, label: WEIGHT_LABELS[w] }));

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The heart of the add flow: pick everything that varies about a piece type in
 * one thumb-reachable screen, then drop the whole cartesian product into the
 * cart in a single tap.
 */
export function Configurator({ type }: { type: PieceType }) {
  const router = useRouter();
  const { add } = useCart();

  const usesFit = type.fitOptions !== undefined;
  const options = (usesFit ? type.fitOptions : type.variantOptions) ?? [];
  const optionLabel = usesFit ? fitLabel : variantLabel;
  const optionWord = usesFit ? "fit" : "style";
  const categoryHref = `/closet/add/${type.category}`;

  const [colors, setColors] = useState<BlockColor[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [materials, setMaterials] = useState<MaterialId[]>([]);
  const [pattern, setPattern] = useState<Pattern>("solid");
  const [weight, setWeight] = useState<Weight>(type.defaultWeight);
  const [nickname, setNickname] = useState("");
  const [notes, setNotes] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const draft = useMemo<Draft>(
    () => ({
      typeId: type.id,
      colors,
      options: picked,
      materials,
      pattern,
      weight,
      nickname: nickname.trim() || undefined,
      notes: notes.trim() || undefined,
    }),
    [type.id, colors, picked, materials, pattern, weight, nickname, notes],
  );

  const count = draftCount(draft);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (colors.length) parts.push(plural(colors.length, "color"));
    if (picked.length) parts.push(plural(picked.length, optionWord));
    if (materials.length === 1) parts.push(getMaterial(materials[0]).label.toLowerCase());
    else if (materials.length > 1) parts.push(plural(materials.length, "material"));
    if (pattern !== "solid") parts.push(PATTERN_LABELS[pattern].toLowerCase());
    return parts.length ? parts.join(" · ") : "Nothing picked yet";
  }, [colors.length, picked.length, materials, pattern, optionWord]);

  function toggleColor(color: BlockColor) {
    const key = colorKey(color);
    setColors((current) =>
      current.some((c) => colorKey(c) === key) ? current.filter((c) => colorKey(c) !== key) : [...current, color],
    );
  }

  function addCustomColor(color: BlockColor) {
    const key = colorKey(color);
    setColors((current) => (current.some((c) => colorKey(c) === key) ? current : [...current, color]));
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function addToCart() {
    if (count === 0) return;
    add(expandDraft(draft, usesFit));
    toast.success(`${plural(count, "piece")} added to cart`);
    // Keep pattern and weight: the next piece of the same type usually shares them.
    setColors([]);
    setPicked([]);
    setMaterials([]);
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(categoryHref);
  }

  return (
    <Screen hasBottomBar>
      <LargeTitleHeader
        title={type.label}
        subtitle={summary}
        leading={<BackButton href={categoryHref} label={CATEGORY_LABELS[type.category]} />}
      />

      <div className="space-y-6 pt-2">
        <ColorSection
          suggested={type.suggestedColors}
          selected={colors}
          onToggle={toggleColor}
          onAddCustom={addCustomColor}
        />

        <section>
          <SectionHeader>{usesFit ? "Fit" : "Style"}</SectionHeader>
          <div className="mx-4 flex flex-wrap gap-2 rounded-xl bg-card p-3">
            {options.map((option) => (
              <Chip
                key={option}
                selected={picked.includes(option)}
                onClick={() => setPicked((current) => toggle(current, option))}
              >
                {optionLabel(option)}
              </Chip>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader>Material</SectionHeader>
          <div className="mx-4 flex flex-wrap gap-2 rounded-xl bg-card p-3">
            {type.materialOptions.map((material) => (
              <Chip
                key={material}
                selected={materials.includes(material)}
                onClick={() => setMaterials((current) => toggle(current, material))}
              >
                {getMaterial(material).label}
              </Chip>
            ))}
          </div>
          <SectionFooter>Optional. Leave empty and the piece has no material.</SectionFooter>
        </section>

        <section>
          <SectionHeader>Pattern</SectionHeader>
          <div className="mx-4 flex flex-wrap gap-2 rounded-xl bg-card p-3">
            {type.patternOptions.map((p) => (
              <Chip key={p} selected={pattern === p} onClick={() => setPattern(p)}>
                {PATTERN_LABELS[p]}
              </Chip>
            ))}
          </div>
        </section>

        {usesFit ? (
          <section>
            <SectionHeader>Weight</SectionHeader>
            <div className="mx-4 rounded-xl bg-card p-3">
              <SegmentedControl options={WEIGHT_SEGMENTS} value={weight} onValueChange={setWeight} label="Weight" />
            </div>
            <SectionFooter>Affects which weather this piece is suggested for.</SectionFooter>
          </section>
        ) : null}

        <section>
          <SectionHeader>More</SectionHeader>
          <div className="mx-4 overflow-hidden rounded-xl bg-card">
            <Row
              title="Nickname & notes"
              subtitle={nickname.trim() || notes.trim() ? "Applied to every piece added" : undefined}
              chevron={false}
              onClick={() => setMoreOpen((open) => !open)}
              trailing={
                <ChevronDown
                  size={18}
                  aria-hidden
                  className={cn("text-label-3 transition-transform duration-200 ease-out", moreOpen && "rotate-180")}
                />
              }
            />
            {moreOpen ? (
              <div className="space-y-3 border-t border-separator p-4">
                <Input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g. the Uniqlo one"
                  maxLength={60}
                  aria-label="Nickname"
                  className="bg-card-2"
                />
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes"
                  maxLength={500}
                  aria-label="Notes"
                  className="bg-card-2"
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <BottomBar>
        <span className="min-w-0 flex-1 truncate text-subhead tabular-nums text-label-2">
          {count > 0 ? `Creates ${plural(count, "piece")}` : `Pick colors and a ${optionWord}`}
        </span>
        <Button className="shrink-0 px-5" disabled={count === 0} onClick={addToCart}>
          Add to cart
        </Button>
      </BottomBar>
    </Screen>
  );
}
