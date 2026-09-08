/**
 * Types for the garment-art generation pipeline.
 *
 * The pipeline turns a short written brief about a piece type into one
 * technical-flat SVG that matches the drawings in
 * `src/components/silhouettes/art`: front view, cropped to the art plus 4%
 * padding, tinted through `--icon-fill` / `--icon-fill-2` / `--icon-stroke`.
 */

/** What a drawing is supposed to show. One per piece type. */
export interface ArtBrief {
  /** Slug used for the file name, e.g. `"skirt"`. */
  id: string;
  /** Human label, e.g. `"Skirt"`. */
  label: string;
  /** Where the piece sits in an outfit: top, bottom, outer, shoes, accessory. */
  role: string;
  /** One sentence describing the drawing to make. */
  brief: string;
  /** Bullet features the drawing has to show to be recognisable. */
  features: string[];
  /**
   * Rough width:height of the finished drawing. Only a hint for the model —
   * the normaliser crops to the real bounding box either way.
   */
  aspect?: "tall" | "square" | "wide";
}

/** A style example handed to the model: the raw text of an existing drawing. */
export interface ArtExample {
  id: string;
  svg: string;
}

/** Token usage as OpenAI-compatible endpoints report it. */
export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  /** Cached prompt tokens, when the provider reports them. */
  cached_tokens?: number;
}

export type ChatContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** Ask the provider for a JSON object back (used by the critique step). */
  json?: boolean;
}

export interface ChatResult {
  text: string;
  model: string;
  usage: ChatUsage;
  ms: number;
  /** What the provider actually billed, when it says. Beats the price table. */
  costUsd?: number;
}

/** Anything that can answer a chat request: OpenRouter, a CLI, a stub. */
export type ChatFn = (request: ChatRequest) => Promise<ChatResult>;

/** Rasterises a normalised SVG to a `data:image/png;base64,…` URL. */
export type RenderFn = (svg: string, sizePx: number) => Promise<string>;

/** The vision model's verdict on one rendered drawing. */
export interface ArtVerdict {
  /** 0-5: can you name the piece type from the drawing alone? */
  recognizable: number;
  /** 0-5: does it look like it came from the same set as the examples? */
  styleMatch: number;
  /** 0-5: no floating parts, no stray fills, even line weight. */
  cleanliness: number;
  problems: string[];
  keep: boolean;
}

/** Structural facts the sanitiser can measure without a model. */
export interface ArtInspection {
  elements: number;
  /** Disconnected clusters of geometry. More than one usually means a part floated off. */
  clusters: number;
  aspect: number;
  /** Elements painted with `--icon-fill`. */
  filled: number;
  /** Elements painted with `--icon-fill-2`. */
  filled2: number;
  /** Elements carrying a stroke. */
  stroked: number;
  /** Fraction of the crop box the largest single element covers. */
  largestShare: number;
  problems: string[];
}

export interface ArtScores {
  verdict: ArtVerdict | null;
  inspection: ArtInspection;
  /** 0-15 model total plus a structural penalty. Higher is better. */
  total: number;
}

export interface ArtAttempt {
  iteration: number;
  svg: string;
  scores: ArtScores;
  ms: number;
  usage: ChatUsage;
  costUsd: number;
  /** Sanitiser rejections, when the iteration produced no usable SVG. */
  errors: string[];
}

export interface GeneratedArt {
  brief: ArtBrief;
  model: string;
  /** Best attempt. */
  svg: string;
  viewBox: string;
  body: string;
  scores: ArtScores;
  attempts: ArtAttempt[];
  meta: {
    promptHash: string;
    iterations: number;
    totalMs: number;
    totalCostUsd: number;
    usage: ChatUsage;
  };
}

export interface GenerateArtOptions {
  brief: ArtBrief;
  /** Style examples shown to the model. Two is plenty. */
  examples: ArtExample[];
  /** Provider model id, e.g. `"anthropic/claude-opus-5"`. */
  model: string;
  /** Draw / critique / redraw rounds. 1 skips the revision step. */
  iterations?: number;
  /** Defaults to OpenRouter over `fetch`. */
  chat?: ChatFn;
  /** Without it the critique step is skipped and only structure is scored. */
  render?: RenderFn;
  /** Vision model for the critique. Defaults to `model`. */
  criticModel?: string;
  /** Called after every attempt, for logging. */
  onAttempt?: (attempt: ArtAttempt) => void;
}
