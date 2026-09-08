import { openRouterBaseUrl } from "./providers/openrouter-env";

/**
 * The OpenRouter catalogue, as much of it as this app needs.
 *
 * Held in memory for ten minutes: the list is 400-odd entries that change once
 * a week, and the model picker opens often enough that refetching it per sheet
 * would be silly. Every failure resolves to an empty list rather than throwing,
 * so a picker with no network still renders — it just falls back to the
 * curated ids below.
 */

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  /** US dollars per million tokens, already multiplied out. */
  promptPricePerM: number;
  completionPricePerM: number;
  vision: boolean;
  reasoning: boolean;
}

/**
 * Shown at the top of the picker. Everything else is still one search away;
 * these are the ones worth reaching for first, and they are checked against
 * the live list so a retired id quietly disappears instead of 404ing later.
 */
export const SUGGESTED_MODELS: readonly string[] = [
  "anthropic/claude-opus-5",
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-luna",
  "google/gemini-3.8-flash",
  "moonshotai/kimi-k2.7-code",
];

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

interface RawModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string } | null;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] } | null;
  supported_parameters?: string[] | null;
}

function perMillion(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n * 1_000_000 : 0;
}

function toModelInfo(raw: RawModel): ModelInfo | null {
  if (typeof raw.id !== "string" || !raw.id) return null;
  const parameters = raw.supported_parameters ?? [];
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name ? raw.name : raw.id,
    contextLength: typeof raw.context_length === "number" ? raw.context_length : 0,
    promptPricePerM: perMillion(raw.pricing?.prompt),
    completionPricePerM: perMillion(raw.pricing?.completion),
    vision: (raw.architecture?.input_modalities ?? []).includes("image"),
    reasoning: parameters.includes("reasoning"),
  };
}

/** True when the model can be asked for a JSON schema rather than begged for one. */
function structured(raw: RawModel): boolean {
  const parameters = raw.supported_parameters ?? [];
  return parameters.includes("response_format") || parameters.includes("structured_outputs");
}

let cache: { at: number; models: ModelInfo[] } | null = null;
let inFlight: Promise<ModelInfo[]> | null = null;

async function fetchModels(): Promise<ModelInfo[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    const response = await fetch(`${openRouterBaseUrl()}/models`, {
      headers: {
        Accept: "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { data?: RawModel[] };
    const rows = Array.isArray(payload.data) ? payload.data : [];

    // Only models this app can actually drive: it always asks for a schema.
    const models = rows
      .filter(structured)
      .map(toModelInfo)
      .filter((model): model is ModelInfo => model !== null)
      .sort((a, b) => a.id.localeCompare(b.id));

    return models;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Cached for ten minutes; concurrent callers share one request. */
export async function listOpenRouterModels(): Promise<ModelInfo[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;
  inFlight ??= fetchModels()
    .then((models) => {
      // An empty answer is a failure, not a catalogue: keep whatever we had.
      if (models.length) cache = { at: Date.now(), models };
      return models.length ? models : (cache?.models ?? []);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Drops the models that no longer exist upstream. Order is the curated one. */
export function suggestedFrom(models: ModelInfo[]): ModelInfo[] {
  const byId = new Map(models.map((model) => [model.id, model]));
  return SUGGESTED_MODELS.map((id) => byId.get(id)).filter((model): model is ModelInfo => Boolean(model));
}

/**
 * Whether a model takes a `reasoning` parameter. Unknown models — and a
 * catalogue we could not load — answer false, so the request goes out without
 * it rather than being rejected for a parameter the model never heard of.
 */
export async function supportsReasoning(modelId: string): Promise<boolean> {
  const models = await listOpenRouterModels();
  return models.find((model) => model.id === modelId)?.reasoning ?? false;
}

/** Test seam: forget the cached catalogue. */
export function clearModelCache(): void {
  cache = null;
  inFlight = null;
}
