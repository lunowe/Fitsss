import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { DISLIKE_REASONS, getOccasion } from "@/domain";
import { MAX_LEARNED_AVOID, MAX_LEARNED_LINES } from "./lines";
import type { TasteLine } from "./types";

/**
 * Pure prompt construction for the taste summarizer. Same inputs, same bytes:
 * the system prompt is frozen so it stays a cache hit across every refresh.
 */

/* ------------------------------------------------------------------ */
/* Structured output                                                   */
/* ------------------------------------------------------------------ */

export const tasteOutputSchema = z.object({
  lines: z.array(
    z.object({
      text: z.string(),
      evidence: z.number(),
    }),
  ),
  avoid: z.array(
    z.object({
      text: z.string(),
      evidence: z.number(),
    }),
  ),
});

export type TasteOutput = z.infer<typeof tasteOutputSchema>;

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */

/**
 * Frozen. Nothing scope- or request-specific may ever be interpolated here:
 * this is the cached prefix of every summarizer call.
 */
export const TASTE_SYSTEM_PROMPT = `You maintain a short taste profile for one person, built only from that person's own outfit feedback: what they saved, wore, liked, disliked and swapped.

WHAT A LINE IS
Write observations, not rules. Each line is one concrete, checkable preference — something you could hold up against tomorrow's outfit and say yes or no. "Likes a loose top over straight trousers." "Skips graphic tees for work." Not "has a relaxed, considered aesthetic". Not advice, not a compliment, not a plan.
Every line carries an evidence count: how many events in the feedback support it. Never invent one; if a line rests on two events, say two.

KEEPING THE PROFILE HONEST
You are given the profile as it stands. Keep the lines the feedback still supports, drop the ones it now contradicts, and add what is newly visible. A single event is a hint, not a preference — three or more make it worth writing down, unless the signal is unusually strong. Never exceed 12 like-lines and 8 avoid-lines; when you are at the limit, keep the best-supported.
Lines the person stated themselves are given to you separately. Treat them as true: never restate them, never write anything that contradicts them.

WHAT NOT TO WRITE
Do not restate the style description — it is context, not a finding. Only write what the feedback adds to it. Do not describe the closet, count garments, or explain your reasoning. Never mention brands, shops, prices, trends, or yourself.

VOICE
Plain third-person-free, second-person-free phrasing: start from the verb. "Prefers…", "Avoids…", "Reaches for…", "Skips…". One sentence, under 120 characters, no hedging, no "seems to", no exclamation marks.`;

/* ------------------------------------------------------------------ */
/* User message                                                        */
/* ------------------------------------------------------------------ */

/** One outfit event, flattened to the labels a reader can follow. */
export interface TasteEventForPrompt {
  /** ISO timestamp or Date; only the calendar day is used. */
  createdAt: string | Date;
  type: string;
  occasion?: string | null;
  /** Effective temperature at the time, if known. */
  tempC?: number | null;
  /** Piece labels in display order, not ids. */
  labels: string[];
  reason?: string | null;
}

export interface TasteScope {
  styleName: string;
  styleDescription?: string | null;
}

export interface BuildTastePromptInput {
  /** The style this profile is about, or null for the overall profile. */
  scope: TasteScope | null;
  /** The learned like-lines as they stand today. */
  learned: TasteLine[];
  /** The learned avoid-lines as they stand today. */
  learnedAvoid: TasteLine[];
  /** Lines the person typed. Preserved verbatim, never contradicted. */
  userLines: TasteLine[];
  /** Avoid-lines the person typed. */
  userAvoid: TasteLine[];
  /** Output of `affinitySummaryLines`. */
  affinity: { favorites: string[]; avoid: string[] };
  /** Chronological, oldest first. Only the last 60 are used. */
  events: TasteEventForPrompt[];
}

/** How many events the summarizer gets to read. */
export const MAX_PROMPT_EVENTS = 60;

const REASON_LABELS = new Map(DISLIKE_REASONS.map((r) => [r.id as string, r.label]));

function day(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown date";
  return date.toISOString().slice(0, 10);
}

/**
 * `2026-09-02 worn · Everyday · 21° · white relaxed cotton t-shirt + denim blue straight jeans`
 */
export function eventLine(event: TasteEventForPrompt): string {
  const parts = [`${day(event.createdAt)} ${event.type}`];
  const occasion = event.occasion ? getOccasion(event.occasion)?.label ?? event.occasion : null;
  if (occasion) parts.push(occasion);
  if (typeof event.tempC === "number" && Number.isFinite(event.tempC)) {
    parts.push(`${Math.round(event.tempC)}°`);
  }
  parts.push(event.labels.join(" + "));
  if (event.reason) parts.push(REASON_LABELS.get(event.reason)?.toLowerCase() ?? event.reason);
  return parts.join(" · ");
}

function lineList(lines: TasteLine[]): string[] {
  return lines.map((line) =>
    typeof line.evidence === "number" && line.evidence > 0
      ? `- ${line.text} (evidence: ${line.evidence})`
      : `- ${line.text}`,
  );
}

export function buildTasteUserMessage(input: BuildTastePromptInput): string {
  const sections: string[] = [];

  /* Scope */
  const scope = ["PROFILE"];
  if (input.scope) {
    scope.push(`This profile is about one style: ${input.scope.styleName}.`);
    const description = input.scope.styleDescription?.trim();
    if (description) scope.push(`The person describes it as: ${description}`);
    scope.push("Do not repeat that description back. Write only what the feedback adds to it.");
  } else {
    scope.push("This profile is overall, across styles.");
  }
  sections.push(scope.join("\n"));

  /* Existing learned lines */
  const learned = [
    "PROFILE AS IT STANDS — keep what still holds, drop what the feedback contradicts",
    "Likes:",
    ...(input.learned.length ? lineList(input.learned) : ["- (nothing yet)"]),
    "Avoid:",
    ...(input.learnedAvoid.length ? lineList(input.learnedAvoid) : ["- (nothing yet)"]),
  ];
  sections.push(learned.join("\n"));

  /* User-stated lines */
  if (input.userLines.length || input.userAvoid.length) {
    const stated = [
      "STATED BY THE PERSON — true, already shown to them, never repeat or contradict these",
    ];
    if (input.userLines.length) stated.push("Likes:", ...input.userLines.map((l) => `- ${l.text}`));
    if (input.userAvoid.length) stated.push("Avoid:", ...input.userAvoid.map((l) => `- ${l.text}`));
    sections.push(stated.join("\n"));
  }

  /* Affinity */
  if (input.affinity.favorites.length || input.affinity.avoid.length) {
    sections.push(
      ["PIECES, COUNTED", ...input.affinity.favorites, ...input.affinity.avoid].join("\n"),
    );
  }

  /* Events */
  const events = input.events.slice(-MAX_PROMPT_EVENTS);
  sections.push(
    [
      `FEEDBACK — the last ${events.length} event${events.length === 1 ? "" : "s"}, oldest first`,
      ...(events.length ? events.map(eventLine) : ["(no events)"]),
    ].join("\n"),
  );

  /* Task */
  sections.push(
    `TASK\nReturn the updated profile: "lines" for what this person tends to like (at most ${MAX_LEARNED_LINES}) and "avoid" for what to keep away from (at most ${MAX_LEARNED_AVOID}), best-supported first, each with its evidence count.`,
  );

  return sections.join("\n\n");
}

export interface BuiltTastePrompt {
  system: Anthropic.TextBlockParam[];
  user: string;
}

export function buildTastePrompt(input: BuildTastePromptInput): BuiltTastePrompt {
  return {
    system: [
      {
        type: "text",
        text: TASTE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    user: buildTasteUserMessage(input),
  };
}
