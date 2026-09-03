import type { CSSProperties } from "react";

import { ART_FOR_TYPE, Silhouette, silhouetteForType } from "@/components/silhouettes";
import { CATEGORIES, CATEGORY_LABELS, pieceTypesFor } from "@/domain";

export const metadata = { title: "Silhouettes" };

type ColorRow = { label: string; color: string; secondaryColor?: string };

const ROWS: ColorRow[] = [
  { label: "White", color: "#ffffff" },
  { label: "Navy", color: "#1f2a44" },
  { label: "Olive", color: "#6b6b3a" },
];

function Cell({
  typeId,
  size,
  color,
  secondaryColor,
}: {
  typeId: string;
  size: number;
  color: string;
  secondaryColor?: string;
}) {
  const mapped = typeId in ART_FOR_TYPE;
  return (
    <li className="flex flex-col items-center gap-1.5">
      <div className="flex items-end gap-1">
        <Silhouette
          typeId={typeId}
          color={color}
          secondaryColor={secondaryColor}
          size={size}
          title={typeId}
        />
        <Silhouette
          id={silhouetteForType(typeId)}
          color={color}
          secondaryColor={secondaryColor}
          size={Math.round(size * 0.55)}
          className="opacity-60"
        />
      </div>
      <span className="text-center text-[10px] leading-none opacity-50">
        {typeId}
        {mapped ? "" : " · glyph only"}
      </span>
    </li>
  );
}

function Panel({ theme, size }: { theme: "light" | "dark"; size: number }) {
  const light = theme === "light";
  return (
    <section
      className={light ? "bg-white text-black" : "bg-black text-white"}
      style={{ "--color-label": light ? "#000000" : "#ffffff" } as CSSProperties}
    >
      <div className="mx-auto max-w-6xl px-5 py-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] opacity-50">
          {light ? "Light background" : "Dark background"}
        </h2>
        {ROWS.map((row) => (
          <div key={row.label} className="mt-7">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-medium opacity-60">
              <span
                className="inline-block h-3 w-3 rounded-full ring-1 ring-black/20 dark:ring-white/20"
                style={{ background: row.color }}
              />
              {row.label} — art next to the drawn glyph
            </div>
            {CATEGORIES.map((category) => (
              <div key={category} className="mt-4">
                <h3 className="mb-2 text-[10px] uppercase tracking-[0.08em] opacity-40">
                  {CATEGORY_LABELS[category]}
                </h3>
                <ul
                  className="grid gap-x-2 gap-y-4"
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(size + 60, 120)}px, 1fr))`,
                  }}
                >
                  {pieceTypesFor(category).map((type) => (
                    <Cell
                      key={type.id}
                      typeId={type.id}
                      size={size}
                      color={row.color}
                      secondaryColor={row.secondaryColor}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function SilhouetteGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ size?: string }>;
}) {
  const { size: raw } = await searchParams;
  const parsed = Number(raw);
  const size = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 320) : 64;
  const types = CATEGORIES.flatMap((category) => pieceTypesFor(category));
  const mapped = types.filter((type) => type.id in ART_FOR_TYPE).length;

  return (
    <main className="min-h-dvh font-sans">
      <header className="bg-white px-5 py-6 text-black">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-bold tracking-tight">Silhouettes</h1>
          <p className="mt-1 text-sm opacity-60">
            {mapped} of {types.length} piece types have technical-flat art (shown large), each next
            to its drawn glyph (small, faded), at {size}px. Try{" "}
            <code className="rounded bg-black/5 px-1 py-0.5">?size=120</code> or{" "}
            <code className="rounded bg-black/5 px-1 py-0.5">?size=40</code>.
          </p>
        </div>
      </header>
      <Panel theme="light" size={size} />
      <Panel theme="dark" size={size} />
    </main>
  );
}
