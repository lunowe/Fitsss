import type { BlockColor, Category, MaterialId, Pattern } from "./types";

/**
 * Inspiration: a picture of an outfit (Pinterest, a photo) abstracted into
 * the same block vocabulary as the closet, then matched against what the
 * user owns.
 */

/** One garment seen in the picture, expressed in catalog vocabulary. */
export interface InspoPiece {
  category: Category;
  /** A piece type id from src/domain/catalog.ts, the closest one. */
  typeId: string;
  color: BlockColor;
  secondaryColor?: BlockColor;
  fit?: string;
  variant?: string;
  material?: MaterialId;
  pattern: Pattern;
  /** 0..1, how sure the model is about this piece being there and what it is. */
  confidence: number;
  /** Short free-text detail worth keeping, e.g. "cropped, boxy, half-tucked". */
  note?: string;
}

export interface InspoAnalysis {
  /** One sentence describing the look as a whole, for prompts and captions. */
  summary: string;
  pieces: InspoPiece[];
  /** Three to six words: "relaxed", "monochrome", "workwear". */
  vibe: string[];
  /** Dominant colors as hex, most prominent first. */
  palette: string[];
  /** How the silhouette is built: "loose top, straight leg, chunky shoe". */
  silhouette: string;
  /** 1..5 like blocks. */
  formality: number;
  /** Which model produced this ("mock" when LLM_MOCK). */
  model: string;
}

/** A pictured piece matched to an owned block, or flagged as a gap. */
export interface InspoPieceMatch {
  pieceIndex: number;
  blockId: string;
  /** 0..1 similarity. */
  score: number;
}

export interface InspoGap {
  pieceIndex: number;
  /** What would fill it, in plain words: "a beige relaxed overshirt". */
  description: string;
}

export interface InspoMatch {
  matches: InspoPieceMatch[];
  gaps: InspoGap[];
  /** 0..1 share of the pictured look that the closet covers, weighted by confidence. */
  coverage: number;
}

export interface Inspo {
  id: string;
  sourceUrl: string | null;
  /** Route that serves the stored image. */
  imageUrl: string;
  width: number;
  height: number;
  analysis: InspoAnalysis | null;
  match: InspoMatch | null;
  /** Style this inspo is saved as a reference for, if any. */
  styleId: string | null;
  note: string | null;
  createdAt: Date;
}

/** Renders an analysis as prompt text for the generation engine. */
export function inspirationForPrompt(a: InspoAnalysis): string {
  const pieces = a.pieces
    .map((p) => {
      const bits = [p.color.name.toLowerCase()];
      if (p.pattern !== "solid") bits.push(p.pattern);
      if (p.fit) bits.push(p.fit);
      if (p.material) bits.push(p.material);
      bits.push(p.typeId.replace(/-/g, " "));
      if (p.variant) bits.push(`(${p.variant})`);
      if (p.note) bits.push(`— ${p.note}`);
      return `- ${bits.join(" ")}`;
    })
    .join("\n");
  return [
    a.summary,
    `Vibe: ${a.vibe.join(", ")}. Silhouette: ${a.silhouette}. Formality ${a.formality}/5.`,
    `Palette: ${a.palette.join(", ")}.`,
    "Pieces in the picture:",
    pieces,
  ].join("\n");
}
