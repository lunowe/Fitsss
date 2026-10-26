"use server";

import { ART } from "@/components/silhouettes/art";
import { getPieceType, fitLabel, variantLabel } from "@/domain/catalog";
import type { Category } from "@/domain/types";
import { BRIEFS, generateArt } from "@/lib/art";
import type { ArtBrief, ArtExample } from "@/lib/art/types";
import { requireAdmin } from "@/lib/session";
import { withCatalog } from "@/server/catalog-queries";
import { setPieceArt } from "@/server/content";
import { getLlmSettingsForUser } from "@/server/settings-queries";

/** Which built-in drawing best teaches the model each role's shape. */
const EXAMPLE_FOR_ROLE: Record<Category, string> = {
  top: "tee",
  layer: "hoodie",
  outerwear: "denim-jacket",
  bottom: "trousers",
  footwear: "sneaker-slip-on",
  accessory: "scarf",
  fullbody: "gen-dress",
};

const ROLE_WORD: Record<Category, string> = {
  top: "top",
  layer: "layer",
  outerwear: "outerwear",
  bottom: "bottom",
  footwear: "shoes",
  accessory: "accessory",
  fullbody: "full-body piece",
};

function exampleFor(id: string): ArtExample | null {
  const piece = ART[id];
  if (!piece) return null;
  return { id, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${piece.viewBox}">${piece.body}</svg>` };
}

/**
 * A brief for any catalog type: the hand-written one when we have it,
 * otherwise assembled from the type's own vocabulary.
 */
function briefForType(typeId: string, variant: string | null): ArtBrief | null {
  const type = getPieceType(typeId);
  if (!type) return null;
  const written = BRIEFS[typeId];
  if (written && !variant) return written;

  const detail = variant
    ? variantLabel(variant).toLowerCase()
    : type.fitOptions?.includes("regular")
      ? "regular"
      : (type.fitOptions?.[0] ?? "");
  const label = variant ? `${variantLabel(variant)} ${type.label.toLowerCase()}` : type.label;
  const features = [
    `must read as a ${type.label.toLowerCase()} at 40 px, not a generic ${ROLE_WORD[type.category]}`,
    detail ? `${detail} shape` : "typical shape for the piece",
    type.materialOptions[0] ? `drawn as if in ${type.materialOptions[0]}` : "plain fabric",
    "front view, laid flat, symmetric where the garment is",
  ];
  return {
    id: variant ? `${typeId}-${variant}` : typeId,
    label,
    role: ROLE_WORD[type.category],
    brief: `A ${label.toLowerCase()} (${ROLE_WORD[type.category]}), laid flat, front view.${type.fitOptions ? ` Fit: ${type.fitOptions.map((f) => fitLabel(f).toLowerCase()).slice(0, 3).join(", ")}.` : ""}`,
    features,
    aspect: type.category === "footwear" || type.category === "accessory" ? "wide" : "tall",
  };
}

export type GeneratePieceArtResult =
  | { ok: true; svg: string; viewBox: string; body: string; model: string; ms: number; costUsd: number; score: number | null }
  | { ok: false; error: string };

/**
 * Draws one piece type with the configured outfits model and returns the
 * drawing as a preview. Nothing is saved until `keepGeneratedArt` is called.
 */
export async function generatePieceArt(input: { typeId: string; variant?: string | null }): Promise<GeneratePieceArtResult> {
  const currentUser = await requireAdmin();
  const typeId = typeof input?.typeId === "string" ? input.typeId.trim() : "";
  const variant = typeof input?.variant === "string" && input.variant.trim() ? input.variant.trim() : null;
  if (!typeId) return { ok: false, error: "Pick a piece type first." };

  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return { ok: false, error: "Add OPENROUTER_API_KEY to .env.local to draw artwork." };

  return withCatalog(currentUser.id, async () => {
    const type = getPieceType(typeId);
    const brief = briefForType(typeId, variant);
    if (!type || !brief) return { ok: false, error: "That piece type does not exist." };

    const examples = [exampleFor(EXAMPLE_FOR_ROLE[type.category]), exampleFor("tee")]
      .filter((e): e is ArtExample => e !== null)
      .filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i);

    const settings = await getLlmSettingsForUser(currentUser.id);
    const model = settings.models.outfits.includes("/") ? settings.models.outfits : "anthropic/claude-opus-5";

    try {
      const art = await generateArt({ brief, examples, model, iterations: 1 });
      return {
        ok: true,
        svg: art.svg,
        viewBox: art.viewBox,
        body: art.body,
        model: art.model,
        ms: art.meta.totalMs,
        costUsd: art.meta.totalCostUsd,
        score: art.scores.verdict ? art.scores.total : null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The drawing did not come back.";
      return { ok: false, error: message.slice(0, 200) };
    }
  });
}

/** Stores a previewed drawing as this type's artwork. */
export async function keepGeneratedArt(input: { typeId: string; variant?: string | null; svg: string }) {
  return setPieceArt({ typeId: input.typeId, variant: input.variant ?? null, svg: input.svg, source: "generated" });
}
