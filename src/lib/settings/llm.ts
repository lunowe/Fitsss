/**
 * Which model answers which question.
 *
 * Pure: no database, no `process.env` reads, no framework imports. The stored
 * shape lives in `settings.llm` (a jsonb column), the environment can pin any
 * field, and `resolveLlmSettings` is the single place those two are combined.
 */

export const LLM_PROVIDERS = ["openrouter", "anthropic", "mock"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const LLM_TASKS = ["outfits", "taste", "vision"] as const;
export type LlmTask = (typeof LLM_TASKS)[number];

export const LLM_EFFORT_LEVELS = ["low", "medium", "high"] as const;
export type LlmEffortLevel = (typeof LLM_EFFORT_LEVELS)[number];

export interface LlmSettings {
  provider: LlmProvider;
  /** OpenRouter-style ids ("anthropic/claude-opus-5"), one per task. */
  models: Record<LlmTask, string>;
  effort: LlmEffortLevel;
}

/** What each task is called in the UI, and what it actually does. */
export const LLM_TASK_LABELS: Record<LlmTask, string> = {
  outfits: "Outfits",
  taste: "Taste notes",
  vision: "Picture reading",
};

export const LLM_TASK_HINTS: Record<LlmTask, string> = {
  outfits: "Composes the looks on Today.",
  taste: "Summarises your feedback into taste notes.",
  vision: "Reads an inspiration picture into pieces. Needs a vision model.",
};

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  mock: "Mock",
};

/** The env var each provider needs before it can be called. */
export const LLM_PROVIDER_KEY_VAR: Record<LlmProvider, string | null> = {
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  mock: null,
};

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  provider: "openrouter",
  models: {
    outfits: "anthropic/claude-opus-5",
    taste: "anthropic/claude-sonnet-5",
    vision: "anthropic/claude-sonnet-5",
  },
  effort: "medium",
};

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && (LLM_PROVIDERS as readonly string[]).includes(value);
}

export function isLlmTask(value: unknown): value is LlmTask {
  return typeof value === "string" && (LLM_TASKS as readonly string[]).includes(value);
}

export function isLlmEffortLevel(value: unknown): value is LlmEffortLevel {
  return typeof value === "string" && (LLM_EFFORT_LEVELS as readonly string[]).includes(value);
}

/** Model ids are free-form (OpenRouter adds new ones weekly), just bounded. */
export const MAX_MODEL_ID_LENGTH = 120;

function cleanModelId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_MODEL_ID_LENGTH) return null;
  // Anything a URL path segment would choke on is not a model id.
  return /^[A-Za-z0-9._:@/-]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Lenient: anything unreadable falls back to the default rather than throwing,
 * because this parses a jsonb column that older versions of the app wrote.
 */
export function parseLlmSettings(raw: unknown): LlmSettings {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawModels = (
    typeof input.models === "object" && input.models !== null ? input.models : {}
  ) as Record<string, unknown>;

  const models = { ...DEFAULT_LLM_SETTINGS.models };
  for (const task of LLM_TASKS) {
    models[task] = cleanModelId(rawModels[task]) ?? DEFAULT_LLM_SETTINGS.models[task];
  }

  return {
    provider: isLlmProvider(input.provider) ? input.provider : DEFAULT_LLM_SETTINGS.provider,
    models,
    effort: isLlmEffortLevel(input.effort) ? input.effort : DEFAULT_LLM_SETTINGS.effort,
  };
}

/**
 * Strict: what a server action accepts from the client. Returns the problems
 * instead of throwing, per the project's boundary rule.
 */
export function validateLlmSettings(
  raw: unknown,
): { ok: true; value: LlmSettings } | { ok: false; errors: string[] } {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (input.provider !== undefined && !isLlmProvider(input.provider)) {
    errors.push(`Unknown provider. Pick one of ${LLM_PROVIDERS.join(", ")}.`);
  }
  if (input.effort !== undefined && !isLlmEffortLevel(input.effort)) {
    errors.push(`Unknown effort. Pick one of ${LLM_EFFORT_LEVELS.join(", ")}.`);
  }

  const rawModels = (
    typeof input.models === "object" && input.models !== null ? input.models : {}
  ) as Record<string, unknown>;
  for (const task of LLM_TASKS) {
    const value = rawModels[task];
    if (value !== undefined && cleanModelId(value) === null) {
      errors.push(`"${LLM_TASK_LABELS[task]}" needs a model id.`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: parseLlmSettings(input) };
}

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

/**
 * The env vars that can pin a setting. Typed as a plain record so the pure
 * module never reaches for `process` itself — callers pass `process.env`.
 */
export interface LlmEnv {
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
  LLM_MODEL_OUTFITS?: string;
  LLM_MODEL_TASTE?: string;
  LLM_MODEL_VISION?: string;
  LLM_EFFORT?: string;
  LLM_MOCK?: string;
  /** So `process.env` itself can be passed straight in. */
  [key: string]: string | undefined;
}

type LlmEnvKey =
  | "LLM_PROVIDER"
  | "LLM_MODEL"
  | "LLM_MODEL_OUTFITS"
  | "LLM_MODEL_TASTE"
  | "LLM_MODEL_VISION"
  | "LLM_EFFORT"
  | "LLM_MOCK";

const MODEL_ENV_KEY: Record<LlmTask, LlmEnvKey> = {
  outfits: "LLM_MODEL_OUTFITS",
  taste: "LLM_MODEL_TASTE",
  vision: "LLM_MODEL_VISION",
};

function envValue(env: LlmEnv, key: LlmEnvKey): string | null {
  const raw = env[key];
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed || null;
}

/** True when LLM_MOCK is on. An empty value is off, so the line can stay. */
export function isMockEnv(env: LlmEnv): boolean {
  const raw = envValue(env, "LLM_MOCK");
  return raw !== null && raw !== "0" && raw.toLowerCase() !== "false";
}

/**
 * Stored settings, with the environment on top. Only a set (non-empty) env var
 * overrides; `LLM_MOCK=1` wins over everything, which is what makes the mock
 * path a one-line change in .env.local.
 */
export function resolveLlmSettings(stored: unknown, env: LlmEnv = {}): LlmSettings {
  const base = parseLlmSettings(stored);

  const envProvider = envValue(env, "LLM_PROVIDER");
  const provider: LlmProvider = isMockEnv(env)
    ? "mock"
    : isLlmProvider(envProvider)
      ? envProvider
      : base.provider;

  const legacy = cleanModelId(envValue(env, "LLM_MODEL"));
  const models = { ...base.models };
  for (const task of LLM_TASKS) {
    const perTask = cleanModelId(envValue(env, MODEL_ENV_KEY[task]));
    models[task] = perTask ?? legacy ?? base.models[task];
  }

  const envEffort = envValue(env, "LLM_EFFORT");
  const effort = isLlmEffortLevel(envEffort) ? envEffort : base.effort;

  return { provider, models, effort };
}

export interface LlmEnvOverrides {
  provider: string | null;
  models: Record<LlmTask, string | null>;
  effort: string | null;
}

/**
 * Which fields the environment has taken over, and under what name — so the
 * screen can say "pinned by LLM_MODEL_VISION" instead of silently ignoring a
 * pick the person just made.
 */
export function llmEnvOverrides(env: LlmEnv = {}): LlmEnvOverrides {
  const legacy = cleanModelId(envValue(env, "LLM_MODEL")) ? "LLM_MODEL" : null;
  const models = {} as Record<LlmTask, string | null>;
  for (const task of LLM_TASKS) {
    const key = MODEL_ENV_KEY[task];
    models[task] = cleanModelId(envValue(env, key)) ? key : legacy;
  }
  return {
    provider: isMockEnv(env)
      ? "LLM_MOCK"
      : isLlmProvider(envValue(env, "LLM_PROVIDER"))
        ? "LLM_PROVIDER"
        : null,
    models,
    effort: isLlmEffortLevel(envValue(env, "LLM_EFFORT")) ? "LLM_EFFORT" : null,
  };
}
