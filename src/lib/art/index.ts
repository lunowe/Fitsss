/**
 * Generating garment art for piece types the imported set does not cover.
 *
 * `generateArt` is the whole surface: give it a brief, a couple of existing
 * drawings as style examples and a model id, and it returns a sanitised,
 * cropped, house-style SVG plus what it cost to make.
 */

export { BRIEFS, BRIEF_IDS } from "./briefs";
export { CRITIQUE_PX, generateArt } from "./generate";
export {
  clusterCount,
  extractSvg,
  normalizeArt,
  DRAW_FILL,
  DRAW_FILL_2,
  ICON_FILL,
  ICON_FILL_2,
  ICON_STROKE,
} from "./normalize";
export type { NormalizeOptions, NormalizeResult, NormalizeOk, NormalizeFail } from "./normalize";
export { addUsage, costOf, emptyUsage, openRouterChat, PRICES } from "./openrouter";
export type { ModelPrice, OpenRouterOptions } from "./openrouter";
export {
  buildCritiquePrompt,
  buildDrawPrompt,
  buildRevisePrompt,
  hashPrompt,
  parseVerdict,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
} from "./prompt";
export { inspectArt, isKeeper, MAX_ELEMENTS, MIN_ELEMENTS, scoreArt } from "./quality";
export type {
  ArtAttempt,
  ArtBrief,
  ArtExample,
  ArtInspection,
  ArtScores,
  ArtVerdict,
  ChatFn,
  ChatMessage,
  ChatRequest,
  ChatResult,
  ChatUsage,
  GeneratedArt,
  GenerateArtOptions,
  RenderFn,
} from "./types";
