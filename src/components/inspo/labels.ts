import { fitLabel, getPieceType, variantLabel } from "@/domain/catalog";
import { PATTERN_LABELS, type InspoAnalysis, type InspoPiece } from "@/domain";

/** "relaxed monochrome workwear" → "Relaxed Monochrome Workwear". */
function titleCase(words: string[]): string {
  return words
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/** The short name a picture goes by: its first three vibe words. */
export function inspoName(analysis: InspoAnalysis | null): string {
  const name = analysis ? titleCase(analysis.vibe.slice(0, 3)) : "";
  return name || "Inspiration";
}

/** Catalog label for a pictured piece, e.g. "Overshirt". */
export function pieceTypeLabel(piece: Pick<InspoPiece, "typeId">): string {
  return getPieceType(piece.typeId)?.label ?? piece.typeId;
}

/**
 * The pictured piece's second caption line: "Beige · Relaxed", falling back to
 * the pattern when the piece has neither a fit nor a variant.
 */
export function pieceColorLine(piece: InspoPiece): string {
  const parts = [piece.color.name];
  if (piece.fit) parts.push(fitLabel(piece.fit));
  else if (piece.variant) parts.push(variantLabel(piece.variant));
  else if (piece.pattern !== "solid") parts.push(PATTERN_LABELS[piece.pattern]);
  return parts.join(" · ");
}

/** How close an owned piece is to the pictured one. */
export function matchWord(score: number): string {
  return score >= 0.8 ? "close" : score >= 0.55 ? "similar" : "loose";
}

/** "You own about 70% of this look." */
export function coverageLine(coverage: number): string {
  return `You own about ${Math.round(coverage * 100)}% of this look.`;
}

/**
 * What the user reads when only a code is available — the share target
 * redirects with `?error=<code>` and no sentence to go with it.
 */
export const INSPO_ERROR_MESSAGES: Record<string, string> = {
  invalid: "That link does not look like a picture.",
  fetch: "Could not fetch that link.",
  "too-large": "That picture is too big.",
  "not-found": "That picture is gone.",
  "not-configured": "Add ANTHROPIC_API_KEY to .env.local and restart the server.",
  llm: "Reading the picture did not work. Try again.",
};

/**
 * The server writes the better sentence, so it wins — except for a missing key,
 * which is a developer's problem and gets the same line as Today.
 */
export function inspoErrorMessage(code: string, message?: string): string {
  if (code === "not-configured") return INSPO_ERROR_MESSAGES["not-configured"];
  return message?.trim() || INSPO_ERROR_MESSAGES[code] || "Something went wrong.";
}

/** Codes where a screenshot is the way out. */
export const SCREENSHOT_HINT = "Take a screenshot and add it as a photo instead.";
