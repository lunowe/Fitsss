/**
 * Draw, look, redraw.
 *
 * One call to `generateArt` produces one normalised drawing for one piece
 * type. Each iteration asks the model for an SVG, sanitises it, measures it,
 * shows the rendered result back to a vision model, and — if that reviewer
 * would not ship it — hands the problems back for a redraw. The best-scoring
 * iteration wins, so a later round can never make the result worse.
 */

import { addUsage, costOf, emptyUsage, openRouterChat } from "./openrouter";
import { normalizeArt } from "./normalize";
import { buildCritiquePrompt, buildDrawPrompt, buildRevisePrompt, hashPrompt, parseVerdict, SYSTEM_PROMPT } from "./prompt";
import { inspectArt, isKeeper, scoreArt } from "./quality";
import type { ArtAttempt, ArtVerdict, ChatFn, GeneratedArt, GenerateArtOptions } from "./types";

/** Size of the raster the critic looks at. */
export const CRITIQUE_PX = 256;

function defaultChat(): ChatFn {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set and no chat function was passed");
  return openRouterChat({ apiKey });
}

/**
 * Generates one drawing.
 *
 * This is what a "Generate artwork" button in the content admin calls:
 *
 * ```ts
 * const art = await generateArt({ brief: BRIEFS.skirt, examples, model, iterations: 2 });
 * // art.viewBox / art.body go straight into the art-override row.
 * ```
 */
export async function generateArt(options: GenerateArtOptions): Promise<GeneratedArt> {
  const { brief, examples, model, iterations = 2, render, onAttempt } = options;
  const chat = options.chat ?? defaultChat();
  const criticModel = options.criticModel ?? model;

  const drawPrompt = buildDrawPrompt(brief, examples);
  const promptHash = hashPrompt(SYSTEM_PROMPT, drawPrompt);

  const attempts: ArtAttempt[] = [];
  let usage = emptyUsage();
  let totalCostUsd = 0;
  const startedAll = Date.now();

  let previousSvg: string | null = null;
  let previousProblems: string[] = [];

  for (let iteration = 1; iteration <= Math.max(1, iterations); iteration += 1) {
    const started = Date.now();
    const userPrompt =
      previousSvg && previousProblems.length
        ? buildRevisePrompt(brief, previousSvg, previousProblems)
        : drawPrompt;

    const drawn = await chat({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 12000,
    });
    usage = addUsage(usage, drawn.usage);
    let cost = drawn.costUsd ?? costOf(model, drawn.usage);

    const normalized = normalizeArt(drawn.text);
    if (!normalized.ok) {
      const attempt: ArtAttempt = {
        iteration,
        svg: "",
        scores: {
          verdict: null,
          inspection: { elements: 0, clusters: 0, aspect: 1, filled: 0, filled2: 0, stroked: 0, largestShare: 0, problems: normalized.errors },
          total: -100,
        },
        ms: Date.now() - started,
        usage: drawn.usage,
        costUsd: cost,
        errors: normalized.errors,
      };
      attempts.push(attempt);
      totalCostUsd += cost;
      onAttempt?.(attempt);
      previousProblems = normalized.errors;
      continue;
    }

    const inspection = inspectArt(normalized);

    let verdict: ArtVerdict | null = null;
    if (render) {
      const dataUrl = await render(normalized.svg, CRITIQUE_PX);
      const critiqued = await chat({
        model: criticModel,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildCritiquePrompt(brief) },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        maxTokens: 2000,
        json: true,
      });
      usage = addUsage(usage, critiqued.usage);
      cost += critiqued.costUsd ?? costOf(criticModel, critiqued.usage);
      verdict = parseVerdict(critiqued.text);
    }

    const scores = scoreArt(inspection, verdict);
    const attempt: ArtAttempt = {
      iteration,
      svg: normalized.svg,
      scores,
      ms: Date.now() - started,
      usage: drawn.usage,
      costUsd: cost,
      errors: [],
    };
    attempts.push(attempt);
    totalCostUsd += cost;
    onAttempt?.(attempt);

    if (isKeeper(scores)) break;
    previousSvg = normalized.svg;
    previousProblems = [...(verdict?.problems ?? []), ...inspection.problems];
    if (!previousProblems.length) break;
  }

  const best = attempts.reduce((a, b) => (b.scores.total > a.scores.total ? b : a));

  return {
    brief,
    model,
    svg: best.svg,
    viewBox: /viewBox="([^"]+)"/.exec(best.svg)?.[1] ?? "0 0 128 128",
    body: /<svg[^>]*>([\s\S]*)<\/svg>/.exec(best.svg)?.[1] ?? "",
    scores: best.scores,
    attempts,
    meta: {
      promptHash,
      iterations: attempts.length,
      totalMs: Date.now() - startedAll,
      totalCostUsd,
      usage,
    },
  };
}
