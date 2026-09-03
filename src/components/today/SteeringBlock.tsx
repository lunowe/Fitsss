"use client";

import Link from "next/link";

import { Chip, ChipRow, SectionFooter, SectionHeader } from "@/components/shell";
import { Input } from "@/components/ui/input";
import { OCCASIONS, type OccasionId } from "@/domain";
import { MAX_STEER_LENGTH } from "@/lib/llm/generation-request";

export interface StyleOption {
  id: string;
  name: string;
}

/**
 * Today's three dials, in the order you actually think about them: which
 * version of yourself, what you are doing, and anything special about today.
 */
export function SteeringBlock({
  styles,
  styleId,
  onStyleChange,
  occasion,
  onOccasionChange,
  steer,
  onSteerChange,
}: {
  styles: StyleOption[];
  /** null means "Any". */
  styleId: string | null;
  onStyleChange: (styleId: string | null) => void;
  occasion: OccasionId;
  onOccasionChange: (occasion: OccasionId) => void;
  steer: string;
  onSteerChange: (steer: string) => void;
}) {
  return (
    <div className="space-y-5">
      <section>
        <SectionHeader>Style</SectionHeader>
        {styles.length ? (
          <ChipRow className="py-0">
            <Chip selected={styleId === null} onClick={() => onStyleChange(null)}>
              Any
            </Chip>
            {styles.map((style) => (
              <Chip key={style.id} selected={styleId === style.id} onClick={() => onStyleChange(style.id)}>
                {style.name}
              </Chip>
            ))}
          </ChipRow>
        ) : (
          <SectionFooter className="mt-0">
            No styles yet.{" "}
            <Link href="/styles" className="text-tint">
              Add styles
            </Link>{" "}
            to steer the stylist towards what you actually wear.
          </SectionFooter>
        )}
      </section>

      <section>
        <SectionHeader>Occasion</SectionHeader>
        <ChipRow className="py-0">
          {OCCASIONS.map((option) => (
            <Chip
              key={option.id}
              selected={occasion === option.id}
              onClick={() => onOccasionChange(option.id)}
            >
              {option.label}
            </Chip>
          ))}
        </ChipRow>
      </section>

      <section className="px-4">
        <Input
          value={steer}
          onChange={(event) => onSteerChange(event.target.value)}
          placeholder="Anything for today? e.g. more relaxed, wear the new boots"
          maxLength={MAX_STEER_LENGTH}
          aria-label="Anything for today"
          enterKeyHint="done"
        />
      </section>
    </div>
  );
}
