import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import {
  CATALOG,
  CATEGORIES,
  CATEGORY_LABELS,
  PALETTE,
  PATTERNS,
  familyForHex,
  getPieceType,
  isMaterialId,
  normalizeHex,
  type BlockColor,
  type InspoAnalysis,
  type InspoPiece,
  type MaterialId,
  type Pattern,
} from "@/domain";

import type { ImageMime } from "./image-size";

/**
 * The vision call that turns a picture of an outfit into blocks.
 *
 * Pure prompt construction plus the post-processing that makes the model's
 * answer safe to store: the model is asked to pick from our vocabulary, and
 * `normalizeAnalysis` then enforces it, because "closest type id" is exactly
 * the kind of instruction a model follows nine times out of ten.
 */

/** More than this and we are describing a crowd, not an outfit. */
export const MAX_INSPO_PIECES = 8;
/** RGB distance under which a colour is treated as a palette colour. */
export const PALETTE_SNAP_DISTANCE = 34;
export const MAX_VIBE_WORDS = 6;
export const MAX_PALETTE_COLORS = 6;

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */

/**
 * Frozen. Cached as the prefix of every analysis, so nothing picture-specific
 * may ever be interpolated in — the vocabulary goes in the user message.
 */
export const INSPO_SYSTEM_PROMPT = `You look at one picture of an outfit and describe every visible garment in a fixed vocabulary.

THE VOCABULARY IS CLOSED
The user message lists every category, piece type id, fit, variant, material and pattern you may use, plus a colour palette. Pick the closest piece type id for each garment you can see and use it exactly as written. Never invent an id, a fit, a variant, a material or a pattern. If a garment has no good id, use the nearest one and say what is different in the note.

WHAT TO REPORT
- One entry per visible garment: top, layer, outerwear, bottom, footwear, accessory, or a full-body piece.
- Do not guess pieces that are not visible. If the shoes are out of frame, there are no shoes. If a shirt is hidden under a coat, only report it when you can actually see part of it.
- Give every piece a colour: a hex value and a plain colour name. Add a secondary colour only when the piece genuinely has two, such as a contrast collar or a stripe.
- Fit is for garments, variant is for footwear and accessories. Give one only when the picture shows it clearly.
- Pattern is required. Use solid when the piece has no pattern.
- confidence is 0 to 1: how sure you are that this piece is there and that this is what it is. A garment you can only half see gets a low number, not a guess dressed up as a fact.
- note is optional and short: how it is worn or cut, such as "cropped, boxy, half-tucked" or "cuffed at the ankle".

THE WHOLE LOOK
- summary: one sentence about the look, not about the person. Never describe or comment on a body, a face, age, gender, ethnicity or attractiveness.
- vibe: three to six adjectives about the clothes, such as relaxed, monochrome, workwear, sharp.
- palette: the dominant colours of the outfit as hex values, most prominent first.
- silhouette: how the shape is built, such as "loose top, straight leg, chunky shoe".
- formality: 1 for gym or home, 3 for a normal day out, 5 for black tie.

NEVER
Never name a brand or guess one. Never mention prices, shops or trends. Never comment on the person wearing the clothes. Never describe anything you cannot see.`;

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

function options(values: readonly string[] | undefined): string | null {
  return values && values.length ? values.join("|") : null;
}

/** The catalog rendered small: one line per type, ids and their allowed values. */
export function buildVocabulary(): string {
  const lines: string[] = ["VOCABULARY — the only piece type ids, fits, variants, materials and patterns you may use"];

  for (const category of CATEGORIES) {
    const types = CATALOG.filter((t) => t.category === category);
    if (!types.length) continue;
    lines.push("", `${CATEGORY_LABELS[category]} (category: ${category})`);
    for (const type of types) {
      const bits: string[] = [type.id];
      const fits = options(type.fitOptions);
      if (fits) bits.push(`fit: ${fits}`);
      const variants = options(type.variantOptions);
      if (variants) bits.push(`variant: ${variants}`);
      const materials = options(type.materialOptions);
      if (materials) bits.push(`material: ${materials}`);
      const patterns = options(type.patternOptions);
      if (patterns) bits.push(`pattern: ${patterns}`);
      lines.push(bits.join(" · "));
    }
  }

  lines.push(
    "",
    "PALETTE — use one of these hex values when the colour is close to it, otherwise give your own hex",
    PALETTE.map((c) => `${c.id} ${c.hex}`).join(" · "),
    "",
    `PATTERNS — ${PATTERNS.join("|")}`,
  );

  return lines.join("\n");
}

export const INSPO_INSTRUCTION =
  "Describe the outfit in this picture using only the vocabulary above. List every garment you can actually see, most prominent first, and stop there.";

/* ------------------------------------------------------------------ */
/* Structured output                                                   */
/* ------------------------------------------------------------------ */

export const inspoAnalysisSchema = z.object({
  pieces: z.array(
    z.object({
      category: z.enum(CATEGORIES),
      typeId: z.string(),
      colorName: z.string(),
      colorHex: z.string(),
      secondaryColorName: z.string().optional(),
      secondaryColorHex: z.string().optional(),
      fit: z.string().optional(),
      variant: z.string().optional(),
      material: z.string().optional(),
      pattern: z.enum(PATTERNS),
      confidence: z.number(),
      note: z.string().optional(),
    }),
  ),
  summary: z.string(),
  vibe: z.array(z.string()),
  palette: z.array(z.string()),
  silhouette: z.string(),
  formality: z.number(),
});

export type InspoAnalysisOutput = z.infer<typeof inspoAnalysisSchema>;

/* ------------------------------------------------------------------ */
/* Message construction                                                */
/* ------------------------------------------------------------------ */

export function buildInspoSystem(): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: INSPO_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];
}

/** Vocabulary, then the picture, then the instruction. */
export function buildInspoUserContent(
  mime: ImageMime,
  base64: string,
): Anthropic.ContentBlockParam[] {
  return [
    { type: "text", text: buildVocabulary() },
    { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
    { type: "text", text: INSPO_INSTRUCTION },
  ];
}

/* ------------------------------------------------------------------ */
/* Post-processing                                                     */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function rgbDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** The palette id for a hex when one sits close enough to claim it. */
export function nearestPaletteId(hex: string): string | undefined {
  let best: { id: string; distance: number } | null = null;
  for (const color of PALETTE) {
    const distance = rgbDistance(hex, color.hex);
    if (!best || distance < best.distance) best = { id: color.id, distance };
  }
  return best && best.distance <= PALETTE_SNAP_DISTANCE ? best.id : undefined;
}

function toColor(name: unknown, hex: unknown): BlockColor | null {
  const normalized = typeof hex === "string" ? normalizeHex(hex) : null;
  if (!normalized) return null;
  const paletteId = nearestPaletteId(normalized);
  const trimmed = typeof name === "string" ? name.trim().slice(0, 40) : "";
  return {
    name: trimmed || PALETTE.find((c) => c.id === paletteId)?.name || "Custom",
    hex: normalized,
    family: familyForHex(normalized),
    ...(paletteId ? { paletteId } : {}),
  };
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

type RawPiece = Partial<InspoAnalysisOutput["pieces"][number]> & Record<string, unknown>;
type RawAnalysis = Partial<InspoAnalysisOutput> & Record<string, unknown>;

/**
 * Turns the model's answer into a stored `InspoAnalysis`.
 *
 * Everything the model said is checked against the catalog rather than
 * trusted: an unknown type id drops the piece, a fit that does not belong to
 * that type is dropped, the category always comes from the catalog even when
 * the model disagrees with itself, and colours are normalised and snapped to
 * the palette so matching later compares like with like.
 */
export function normalizeAnalysis(raw: unknown, model: string): InspoAnalysis {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as RawAnalysis;
  const rawPieces = Array.isArray(input.pieces) ? (input.pieces as RawPiece[]) : [];

  const pieces: InspoPiece[] = [];
  for (const entry of rawPieces) {
    if (pieces.length >= MAX_INSPO_PIECES) break;
    if (typeof entry !== "object" || entry === null) continue;

    const typeId = typeof entry.typeId === "string" ? entry.typeId.trim() : "";
    const type = getPieceType(typeId);
    if (!type) continue; // an id we do not know is not a piece we can style

    const color = toColor(entry.colorName, entry.colorHex);
    if (!color) continue; // no usable colour means nothing to match on

    const secondary = toColor(entry.secondaryColorName, entry.secondaryColorHex);

    const fit =
      typeof entry.fit === "string" && type.fitOptions?.includes(entry.fit.trim())
        ? entry.fit.trim()
        : undefined;
    const variant =
      typeof entry.variant === "string" && type.variantOptions?.includes(entry.variant.trim())
        ? entry.variant.trim()
        : undefined;

    const rawMaterial = typeof entry.material === "string" ? entry.material.trim() : "";
    const material: MaterialId | undefined =
      isMaterialId(rawMaterial) && type.materialOptions.includes(rawMaterial)
        ? rawMaterial
        : undefined;

    const rawPattern = typeof entry.pattern === "string" ? (entry.pattern.trim() as Pattern) : "solid";
    const pattern: Pattern = type.patternOptions.includes(rawPattern) ? rawPattern : "solid";

    const note = text(entry.note, 120);

    pieces.push({
      category: type.category,
      typeId: type.id,
      color,
      ...(secondary ? { secondaryColor: secondary } : {}),
      ...(fit ? { fit } : {}),
      ...(variant ? { variant } : {}),
      ...(material ? { material } : {}),
      pattern,
      confidence: clamp(typeof entry.confidence === "number" ? entry.confidence : 0.5, 0, 1),
      ...(note ? { note } : {}),
    });
  }

  const palette: string[] = [];
  for (const entry of Array.isArray(input.palette) ? input.palette : []) {
    if (palette.length >= MAX_PALETTE_COLORS) break;
    const hex = typeof entry === "string" ? normalizeHex(entry) : null;
    if (hex && !palette.includes(hex)) palette.push(hex);
  }
  // A look always has a palette: fall back to the pieces themselves.
  if (palette.length === 0) {
    for (const piece of pieces) {
      if (palette.length >= MAX_PALETTE_COLORS) break;
      if (!palette.includes(piece.color.hex)) palette.push(piece.color.hex);
    }
  }

  const vibe: string[] = [];
  for (const entry of Array.isArray(input.vibe) ? input.vibe : []) {
    if (vibe.length >= MAX_VIBE_WORDS) break;
    const word = text(entry, 24).toLowerCase();
    if (word && !vibe.includes(word)) vibe.push(word);
  }

  return {
    summary: text(input.summary, 300),
    pieces,
    vibe,
    palette,
    silhouette: text(input.silhouette, 160),
    formality: clamp(Math.round(typeof input.formality === "number" ? input.formality : 3), 1, 5),
    model,
  };
}
