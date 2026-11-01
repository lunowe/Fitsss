import { useId, type CSSProperties } from "react";

import { getArtOverride, getPieceType } from "@/domain/catalog";
import { SILHOUETTE_IDS, type SilhouetteId } from "@/domain/types";

import { GLYPHS, type Glyph } from "./glyphs";
import { KIT, composeLayers, kitKey, type ArtLayers } from "./kit";

export { GLYPHS, KIT, kitKey, SILHOUETTE_IDS };
export type { Glyph, SilhouetteId };

/** Fallback used when a type id is unknown or has no glyph yet. */
const FALLBACK: SilhouetteId = "tee";

/** The glyph a catalog piece type renders with. */
export function silhouetteForType(typeId: string): SilhouetteId {
  const icon = getPieceType(typeId)?.icon;
  return icon && icon in GLYPHS ? icon : FALLBACK;
}

/** Seam lines (creases, zips, baffles, laces) are open paths: outline only. */
const isSeam = (d: string) => !d.trimEnd().endsWith("Z");

interface CommonProps {
  /** Garment color. A hex string, or any CSS color including a var(). */
  color: string;
  /** Optional second color for collars, cuffs, soles, hood interiors. */
  secondaryColor?: string;
  size?: number | string;
  className?: string;
  /** When given, the drawing is exposed to assistive tech with this label. */
  title?: string;
  /** The piece's fit; kit drawings change shape with it. */
  fit?: string | null;
  /** The piece's pattern id. `solid` or unknown draws the plain garment. */
  pattern?: string | null;
  /** Color of the stripes, checks, print or logo. Defaults to a contrasting ink. */
  patternColor?: string | null;
}

export type SilhouetteProps = CommonProps &
  (
    | { id: SilhouetteId; typeId?: string; variant?: string | null }
    | { id?: SilhouetteId; typeId: string; variant?: string | null }
  );

/** Perceived lightness of a hex colour, or null if the colour is not a hex. */
function lightnessOf(color: string): number | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : match[1];
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Outlines have to contrast with the *garment*, not with the theme: a white
 * piece needs dark lines on a white card and on a dark one alike, and a black
 * piece needs light lines in both. So the ink comes from the piece's own
 * lightness, and only falls back to the label colour when the caller passes
 * something we cannot measure (a CSS variable, in the add flow).
 */
const LABEL_INK = "color-mix(in srgb, var(--color-label, currentColor) 70%, transparent)";

function inkFor(color: string, lightness: number | null): string {
  if (lightness === null) return LABEL_INK;
  // Tonal ink: a deep shade of the garment's own colour on light pieces, a pale
  // tint of it on dark ones, so lines belong to the cloth instead of sitting on
  // it as a black or white wireframe.
  return lightness > 0.45
    ? `color-mix(in srgb, ${color} ${TONAL_LIGHT}%, #000)`
    : `color-mix(in srgb, ${color} ${TONAL_DARK}%, #fff)`;
}

/** How much of the garment colour its ink keeps, on light and on dark pieces. */
const TONAL_LIGHT = 40;
const TONAL_DARK = 32;

/**
 * The pattern ink when the piece has no pattern colour of its own: a deep navy
 * on light pieces, an off-white on dark ones, so a stripe always shows.
 */
export function defaultPatternColor(color: string): string {
  const lightness = lightnessOf(color);
  if (lightness === null) return "color-mix(in srgb, currentColor 55%, transparent)";
  return lightness > 0.45 ? "#1f2a44" : "#f4f1ea";
}

/** Collars, soles and cuffs when the piece has no second colour of its own. */
function shadeOf(color: string, lightness: number | null): string {
  const towards = lightness !== null && lightness <= 0.45 ? "#fff" : "#000";
  return `color-mix(in srgb, ${color} 82%, ${towards})`;
}

/**
 * A tinted garment drawing. Prefer passing `typeId` (plus `variant` when the
 * piece has one, and `fit`, `pattern`, `patternColor`): that picks the kit
 * drawing for the type, and falls back to the hand-drawn glyph for custom
 * types with no artwork.
 */
export function Silhouette({
  id,
  typeId,
  variant,
  color,
  secondaryColor,
  size = 48,
  className,
  title,
  fit,
  pattern,
  patternColor,
}: SilhouetteProps) {
  const clipId = `pc${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  // The user's own drawing wins over the kit's; a custom type with no artwork
  // falls through to the neutral glyph its role was given.
  const v = variant ?? undefined;
  const override = typeId ? getArtOverride(typeId, v) : undefined;
  const kit = typeId && !override ? KIT[kitKey(typeId, v, fit ?? undefined) ?? ""] : undefined;
  const art = override ?? kit;
  const layers: ArtLayers | undefined = kit?.layers;
  const label = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true };
  const lightness = lightnessOf(color);
  const ink = inkFor(color, lightness);

  const vars = {
    "--icon-fill": color,
    "--icon-fill-2": secondaryColor ?? shadeOf(color, lightness),
    "--icon-stroke": ink,
    "--icon-pattern": patternColor ?? defaultPatternColor(color),
  } as CSSProperties;

  if (art) {
    const body =
      (layers && pattern && pattern !== "solid" ? composeLayers(layers, pattern, clipId) : undefined) ??
      art.body;
    return (
      <svg
        width={size}
        height={size}
        viewBox={art.viewBox}
        preserveAspectRatio="xMidYMid meet"
        className={className}
        style={vars}
        focusable="false"
        {...label}
        dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : "") + body }}
      />
    );
  }

  const glyph = GLYPHS[id ?? (typeId ? silhouetteForType(typeId) : FALLBACK)] ?? GLYPHS[FALLBACK];
  const second = secondaryColor ?? color;

  return (
    <svg
      width={size}
      height={size}
      viewBox={glyph.viewBox ?? "0 0 64 64"}
      preserveAspectRatio="xMidYMid meet"
      fill={color}
      className={className}
      focusable="false"
      {...label}
    >
      {title ? <title>{title}</title> : null}
      {glyph.paths.map((d, i) => (
        <path
          key={`p${i}`}
          d={d}
          fill={isSeam(d) ? "none" : undefined}
          stroke={ink}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {glyph.secondaryPaths?.map((d, i) => (
        <path
          key={`s${i}`}
          d={d}
          fill={isSeam(d) ? "none" : second}
          stroke={ink}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
