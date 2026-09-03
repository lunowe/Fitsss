import {
  getPieceType,
  type Block,
  type Category,
  type InspoAnalysis,
  type InspoGap,
  type InspoMatch,
  type InspoPiece,
  type InspoPieceMatch,
  type OutfitSlots,
} from "@/domain";

/**
 * Matching a pictured look against the closet.
 *
 * This is where an inspiration picture becomes useful: for every garment the
 * model saw, either the person already owns something close enough to stand in
 * for it, or that is a gap worth naming. Pure and deterministic — no database,
 * no model — so the score weights can be tuned against tests instead of vibes.
 */

/** Below this the model is guessing, and a guess should not consume a block. */
export const MIN_PIECE_CONFIDENCE = 0.35;
/** Best similarity a block needs to stand in for a pictured piece. */
export const MATCH_THRESHOLD = 0.55;

export const WEIGHTS = {
  type: 0.4,
  color: 0.35,
  fit: 0.15,
  material: 0.05,
  pattern: 0.05,
} as const;

/**
 * Types that read as the same thing on a body. A crewneck sweater standing in
 * for a cardigan is a fine restyle; a cardigan standing in for a puffer is not.
 */
export const TYPE_FAMILIES: Record<string, readonly string[]> = {
  tees: ["t-shirt", "long-sleeve-tee", "tank-top", "henley", "polo"],
  shirts: ["shirt", "dress-shirt", "overshirt"],
  knits: ["crewneck-sweater", "cardigan", "turtleneck", "quarter-zip"],
  sweats: ["hoodie", "sweatshirt", "fleece"],
  vests: ["vest"],
  "light-jackets": ["denim-jacket", "bomber", "harrington", "chore-jacket", "leather-jacket", "blazer"],
  coats: ["trench-coat", "wool-coat", "parka", "puffer", "rain-jacket"],
  pants: ["jeans", "chinos", "trousers", "cargo-pants", "sweatpants"],
  shorts: ["shorts", "denim-shorts"],
  skirts: ["skirt"],
  sneakers: ["sneakers"],
  "dress-shoes": ["loafers", "dress-shoes", "boots"],
  sandals: ["sandals"],
  headwear: ["cap", "beanie"],
  neckwear: ["scarf"],
  waist: ["belt"],
  eyewear: ["sunglasses"],
  watches: ["watch"],
  bags: ["bag", "tote"],
  fullbody: ["dress", "jumpsuit"],
};

const FAMILY_BY_TYPE = new Map<string, string>();
for (const [family, ids] of Object.entries(TYPE_FAMILIES)) {
  for (const id of ids) FAMILY_BY_TYPE.set(id, family);
}

export function familyForType(typeId: string): string | undefined {
  return FAMILY_BY_TYPE.get(typeId);
}

/* ------------------------------------------------------------------ */
/* Similarity                                                          */
/* ------------------------------------------------------------------ */

const MAX_RGB_DISTANCE = Math.sqrt(3) * 255;

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) || 0,
    parseInt(hex.slice(3, 5), 16) || 0,
    parseInt(hex.slice(5, 7), 16) || 0,
  ];
}

export function typeScore(pieceTypeId: string, blockTypeId: string): number {
  if (pieceTypeId === blockTypeId) return 1;
  const a = familyForType(pieceTypeId);
  const b = familyForType(blockTypeId);
  if (a && b && a === b) return 0.7;
  return 0.3;
}

export function colorScore(piece: InspoPiece, block: Block): number {
  const [r1, g1, b1] = rgb(piece.color.hex);
  const [r2, g2, b2] = rgb(block.color.hex);
  const distance = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  let score = 1 - distance / MAX_RGB_DISTANCE;
  if (piece.color.family === block.color.family) score += 0.15;
  return Math.min(1, Math.max(0, score));
}

/** Fit for garments, variant for shoes and accessories. Silence is neutral. */
function shapeScore(piece: InspoPiece, block: Block): number {
  const wanted = piece.fit ?? piece.variant;
  if (!wanted) return 0.6;
  const owned = block.fit ?? block.variant;
  if (!owned) return 0.4;
  return owned === wanted ? 1 : 0;
}

function materialScore(piece: InspoPiece, block: Block): number {
  if (!piece.material) return 0.6;
  if (!block.material) return 0.4;
  return piece.material === block.material ? 1 : 0;
}

function patternScore(piece: InspoPiece, block: Block): number {
  if (piece.pattern === block.pattern) return 1;
  // Two different patterns still read closer than a pattern against a plain.
  if (piece.pattern !== "solid" && block.pattern !== "solid") return 0.3;
  return 0;
}

/** 0..1 similarity between a pictured piece and an owned block. */
export function similarity(piece: InspoPiece, block: Block): number {
  return (
    WEIGHTS.type * typeScore(piece.typeId, block.typeId) +
    WEIGHTS.color * colorScore(piece, block) +
    WEIGHTS.fit * shapeScore(piece, block) +
    WEIGHTS.material * materialScore(piece, block) +
    WEIGHTS.pattern * patternScore(piece, block)
  );
}

/* ------------------------------------------------------------------ */
/* Descriptions                                                        */
/* ------------------------------------------------------------------ */

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/** What would fill this gap, in plain words: "a beige relaxed overshirt". */
export function describePiece(piece: InspoPiece): string {
  const bits: string[] = [piece.color.name.toLowerCase()];
  if (piece.pattern !== "solid") bits.push(piece.pattern);
  const shape = piece.fit ?? piece.variant;
  if (shape) bits.push(shape);
  const type = getPieceType(piece.typeId);
  bits.push((type?.label ?? piece.typeId.replace(/-/g, " ")).toLowerCase());
  const phrase = bits.join(" ");
  return `${article(phrase)} ${phrase}`;
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

/**
 * Greedy by confidence: the piece the model is surest about picks first, and a
 * block can only stand in once, so a closet with one white tee cannot pretend
 * to cover two white tees in the picture.
 */
export function matchInspoToCloset(analysis: InspoAnalysis, blocks: Block[]): InspoMatch {
  const active = blocks.filter((b) => !b.archivedAt);
  const byCategory = new Map<Category, Block[]>();
  for (const block of active) {
    const list = byCategory.get(block.category);
    if (list) list.push(block);
    else byCategory.set(block.category, [block]);
  }

  const considered = analysis.pieces
    .map((piece, pieceIndex) => ({ piece, pieceIndex }))
    .filter(({ piece }) => piece.confidence >= MIN_PIECE_CONFIDENCE)
    .sort((a, b) => b.piece.confidence - a.piece.confidence || a.pieceIndex - b.pieceIndex);

  const used = new Set<string>();
  const matches: InspoPieceMatch[] = [];
  const gaps: InspoGap[] = [];
  let covered = 0;
  let total = 0;

  for (const { piece, pieceIndex } of considered) {
    total += piece.confidence;

    let best: { blockId: string; score: number } | null = null;
    for (const block of byCategory.get(piece.category) ?? []) {
      if (used.has(block.id)) continue;
      const score = similarity(piece, block);
      if (!best || score > best.score) best = { blockId: block.id, score };
    }

    if (best && best.score >= MATCH_THRESHOLD) {
      used.add(best.blockId);
      matches.push({ pieceIndex, blockId: best.blockId, score: Math.round(best.score * 1000) / 1000 });
      covered += piece.confidence;
    } else {
      gaps.push({ pieceIndex, description: describePiece(piece) });
    }
  }

  matches.sort((a, b) => a.pieceIndex - b.pieceIndex);
  gaps.sort((a, b) => a.pieceIndex - b.pieceIndex);

  return {
    matches,
    gaps,
    coverage: total > 0 ? Math.round((covered / total) * 1000) / 1000 : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Slots                                                               */
/* ------------------------------------------------------------------ */

const CATEGORY_TO_SLOT: Partial<Record<Category, keyof Omit<OutfitSlots, "accessories">>> = {
  top: "top",
  layer: "layer",
  outerwear: "outerwear",
  bottom: "bottom",
  fullbody: "fullbody",
  footwear: "footwear",
};

/**
 * The matched blocks arranged as outfit slots, so a restyle can start from
 * what the picture actually asked for. Only the first block per slot wins;
 * accessories collect.
 */
export function matchToSlots(match: InspoMatch, analysis: InspoAnalysis): Partial<OutfitSlots> {
  const slots: Partial<OutfitSlots> = {};
  const accessories: string[] = [];

  for (const entry of match.matches) {
    const piece = analysis.pieces[entry.pieceIndex];
    if (!piece) continue;
    if (piece.category === "accessory") {
      if (!accessories.includes(entry.blockId)) accessories.push(entry.blockId);
      continue;
    }
    const slot = CATEGORY_TO_SLOT[piece.category];
    if (!slot || slots[slot]) continue;
    slots[slot] = entry.blockId;
  }

  if (accessories.length) slots.accessories = accessories;
  return slots;
}
