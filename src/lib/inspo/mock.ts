import {
  CATALOG,
  PALETTE,
  familyForHex,
  type Block,
  type BlockColor,
  type Category,
  type InspoAnalysis,
  type InspoPiece,
} from "@/domain";

import { MATCH_THRESHOLD, matchInspoToCloset, similarity } from "./match";

/**
 * The stand-in for the vision model when `LLM_MOCK=1`.
 *
 * It reads the closet back as if it were the picture, which is exactly what
 * makes it useful for development: matching, restyling and the gaps list all
 * have real data to work with without an API key. One piece is deliberately
 * pushed off what the person owns, so the gap path is exercised too rather
 * than only ever showing a flawless 100% match.
 */

/** Categories a mock look is built from, in order. */
const PICK_ORDER: readonly Category[] = ["top", "bottom", "footwear", "layer", "outerwear", "fullbody"];
const MAX_MOCK_PIECES = 4;
/** How far the perturbed colour has to travel to stop reading as the same piece. */
const PERTURB_MIN_DISTANCE = 100;

function distance(a: string, b: string): number {
  const parse = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16) || 0,
    parseInt(hex.slice(3, 5), 16) || 0,
    parseInt(hex.slice(5, 7), 16) || 0,
  ];
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * The closest palette colour that is still clearly a different colour. Keeps
 * the mock look plausible while guaranteeing the closet does not already
 * contain this exact piece.
 */
export function perturbColor(color: BlockColor): BlockColor {
  let best: (typeof PALETTE)[number] | null = null;
  let bestDistance = Infinity;
  for (const candidate of PALETTE) {
    const d = distance(color.hex, candidate.hex);
    if (d < PERTURB_MIN_DISTANCE) continue;
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  if (!best) return color;
  return { name: best.name, hex: best.hex, family: best.family, paletteId: best.id };
}

/**
 * The first type-and-colour combination in this category that nothing in the
 * closet can stand in for. Searched rather than guessed, because "a different
 * colour" is not enough on its own — the same garment in the wrong shade still
 * scores over the line, which is the whole point of the type weight.
 */
function findUnownedPiece(piece: InspoPiece, blocks: Block[]): InspoPiece | null {
  const owned = blocks.filter((b) => b.category === piece.category);
  if (owned.length === 0) return null;

  for (const type of CATALOG) {
    if (type.category !== piece.category) continue;
    for (const color of PALETTE) {
      const candidate: InspoPiece = {
        ...piece,
        typeId: type.id,
        color: { name: color.name, hex: color.hex, family: color.family, paletteId: color.id },
        fit: undefined,
        variant: undefined,
        material: undefined,
        pattern: type.patternOptions.includes(piece.pattern) ? piece.pattern : "solid",
      };
      if (owned.every((block) => similarity(candidate, block) < MATCH_THRESHOLD)) return candidate;
    }
  }
  return null;
}

function blockToPiece(block: Block, confidence: number): InspoPiece {
  return {
    category: block.category,
    typeId: block.typeId,
    color: { ...block.color },
    ...(block.secondaryColor ? { secondaryColor: { ...block.secondaryColor } } : {}),
    ...(block.fit ? { fit: block.fit } : {}),
    ...(block.variant ? { variant: block.variant } : {}),
    ...(block.material ? { material: block.material } : {}),
    pattern: block.pattern,
    confidence,
    ...(block.nickname ? { note: block.nickname } : {}),
  };
}

/**
 * Builds a deterministic analysis from the person's own closet: three or four
 * pieces from different categories, with the last one nudged onto a colour
 * they do not own — and, when the closet still covers it, replaced outright by
 * a piece nothing in that category can stand in for, so the result always has
 * at least one gap to show.
 */
export function buildMockAnalysis(blocks: Block[]): InspoAnalysis {
  const active = blocks.filter((b) => !b.archivedAt);
  const sorted = [...active].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const pieces: InspoPiece[] = [];
  for (const category of PICK_ORDER) {
    if (pieces.length >= MAX_MOCK_PIECES) break;
    const block = sorted.find((b) => b.category === category);
    if (!block) continue;
    pieces.push(blockToPiece(block, pieces.length === 0 ? 0.92 : 0.86 - pieces.length * 0.06));
  }

  if (pieces.length > 1) {
    const last = pieces[pieces.length - 1];
    last.color = perturbColor(last.color);

    if (matchInspoToCloset(compose(pieces), active).gaps.length === 0) {
      // The nudge was not enough: swap in something they genuinely do not own.
      const replacement = findUnownedPiece(last, active);
      if (replacement) pieces[pieces.length - 1] = replacement;
    }
  }

  return compose(pieces);
}

function compose(pieces: InspoPiece[]): InspoAnalysis {
  const palette: string[] = [];
  for (const piece of pieces) if (!palette.includes(piece.color.hex)) palette.push(piece.color.hex);

  const names = pieces.map((p) => `${p.color.name.toLowerCase()} ${p.typeId.replace(/-/g, " ")}`);
  const looseness = pieces.some((p) => p.fit === "oversized" || p.fit === "relaxed") ? "loose" : "clean";

  return {
    summary: names.length
      ? `A ${looseness} everyday look built from ${names.join(", ")}.`
      : "An empty look.",
    pieces,
    vibe: ["mock", looseness, familyForHex(pieces[0]?.color.hex ?? "#8e8e93")],
    palette,
    silhouette: pieces.map((p) => `${p.fit ?? p.variant ?? "regular"} ${p.category}`).join(", "),
    formality: 3,
    model: "mock",
  };
}
