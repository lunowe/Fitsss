/**
 * The prompts. One system prompt describes the house style; the user turn adds
 * the brief plus one or two existing drawings as style examples.
 *
 * Everything here is a pure string builder so the prompt can be hashed and
 * stored next to the drawing it produced: when the style changes, the hash
 * changes, and old art can be regenerated on purpose.
 */

import { DRAW_FILL, DRAW_FILL_2 } from "./normalize";
import type { ArtBrief, ArtExample, ArtVerdict } from "./types";

/** Bumped by hand whenever the wording changes in a way that alters output. */
export const PROMPT_VERSION = 1;

/** Longest style example we are willing to pay for, in characters. */
export const EXAMPLE_LIMIT = 8000;

export const SYSTEM_PROMPT = `You draw technical-flat garment illustrations as clean SVG for a wardrobe app.

Every drawing is one piece of clothing seen from the front, laid flat as in a fashion tech pack: centered, symmetric where the garment is symmetric, with a slight natural drape. No person, no mannequin, no background, no shadows, no gradients, no text, no labels, no measurements.

Output rules, all of them mandatory:
- Answer with exactly one \`<svg viewBox="0 0 128 128">…</svg>\` and nothing else. No prose, no markdown fence, no comments.
- The viewBox may be non-square as long as its long side is 128, e.g. \`0 0 128 74\` for a wide piece. Fill it with the drawing, leaving about 4% margin on the tightest side.
- Allowed elements: path, circle, ellipse, rect, polygon, polyline, line, and g for grouping. Nothing else: no image, no use, no defs, no filter, no gradient, no style block, no CSS classes, no script, no external references.
- The garment body is filled with the literal colour ${DRAW_FILL}. The app swaps that for the wearer's actual colour, so every body panel must use it exactly.
- Secondary details — collar, cuffs, waistband, sole, buckle, hardware, lens, contrast band — are filled ${DRAW_FILL_2}.
- Every outline is \`stroke="#000" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"\`. One constant width everywhere; never thicker, never thinner, never a second colour.
- Seams, topstitching, folds and creases are thin open paths with \`fill="none"\` and the same stroke.
- Never leave fill unset: a shape is either ${DRAW_FILL}, ${DRAW_FILL_2}, or \`fill="none"\`.

Drawing rules:
- Medium detail: enough that the piece type is unmistakable at 40 px, and no more. At most 40 shape elements in total, ideally 12-25.
- Every part of the drawing has to touch the rest of it. Nothing floats off on its own unless the garment really is two separate objects.
- Draw the outer silhouette as one closed path first, then lay details on top of it.
- Proportions matter more than decoration: a viewer should read the type from the outline alone.`;

const exampleBlock = (examples: ArtExample[]): string =>
  examples
    .map(
      (example) =>
        `Example — this is the existing "${example.id}" drawing from the set, already normalised (its fills are the app's variables; yours must be the literal hex colours above):\n${example.svg.slice(0, EXAMPLE_LIMIT)}`,
    )
    .join("\n\n");

/** The first turn: draw this piece. */
export function buildDrawPrompt(brief: ArtBrief, examples: ArtExample[]): string {
  return [
    exampleBlock(examples),
    "",
    `Now draw: ${brief.label} (${brief.role}).`,
    brief.brief,
    "It has to show:",
    ...brief.features.map((feature) => `- ${feature}`),
    brief.aspect ? `Overall proportion: ${brief.aspect}.` : "",
    "",
    "Answer with the SVG only.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The revision turn: here is what you drew and what is wrong with it. */
export function buildRevisePrompt(brief: ArtBrief, previous: string, problems: string[]): string {
  return [
    `This is your previous "${brief.label}" drawing, after the app normalised it:`,
    previous,
    "",
    "A reviewer looking at the rendered image found these problems:",
    ...problems.map((problem) => `- ${problem}`),
    "",
    "Redraw it from scratch, fixing every one of them. Same brief:",
    brief.brief,
    ...brief.features.map((feature) => `- ${feature}`),
    "",
    "Same output rules as before. Answer with the SVG only.",
  ].join("\n");
}

/** The critique turn, sent with a raster of the drawing. */
export function buildCritiquePrompt(brief: ArtBrief): string {
  return `The image shows one icon rendered three times: 40 px, 96 px and 256 px, on a white card and on a dark card, tinted the way the app tints it.

It is meant to be a technical-flat drawing of: ${brief.label} — ${brief.brief}
It should show:
${brief.features.map((feature) => `- ${feature}`).join("\n")}

It belongs to a set of flat garment icons drawn with a constant thin black outline, one grey body fill, one darker grey detail fill, no shading and no text.

Judge it honestly; this set ships in a real app and a bad icon is worse than none.

Answer with one JSON object and nothing else:
{"recognizable": 0-5, "styleMatch": 0-5, "cleanliness": 0-5, "problems": ["..."], "keep": true|false}

- recognizable: at the 40 px size, would someone name the piece type correctly?
- styleMatch: does it read as a flat tech-pack drawing from the same set (proportion, line weight, level of detail)?
- cleanliness: no floating parts, no stray or missing fills, no doubled outlines, no lopsided symmetry.
- problems: short, concrete, fixable. Name the shape and what is wrong with it. Empty if there is nothing to fix.
- keep: true only if you would ship it as-is in a closet grid.`;
}

/** Stable short hash of the prompt text, stored with each drawing. */
export function hashPrompt(...parts: string[]): string {
  const text = `v${PROMPT_VERSION}\n${parts.join("\n")}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
}

/** Pulls the verdict JSON out of a critique answer. */
export function parseVerdict(text: string): ArtVerdict | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  const score = (value: unknown): number => {
    const n = typeof value === "number" ? value : Number.parseFloat(String(value));
    return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 0;
  };
  return {
    recognizable: score(raw.recognizable),
    styleMatch: score(raw.styleMatch),
    cleanliness: score(raw.cleanliness),
    problems: Array.isArray(raw.problems) ? raw.problems.map((p) => String(p)).filter(Boolean) : [],
    keep: raw.keep === true || raw.keep === "true",
  };
}
