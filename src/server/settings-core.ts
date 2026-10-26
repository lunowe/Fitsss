import "server-only";

import { eq, sql } from "drizzle-orm";
import * as z from "zod/v4";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { callStructured, providerConfigured, type UserContent } from "@/lib/llm/provider";
import { isAnthropicConfigured } from "@/lib/llm/providers/anthropic";
import { isOpenRouterConfigured } from "@/lib/llm/providers/openrouter-env";
import {
  DEFAULT_LLM_SETTINGS,
  LLM_EFFORT_LEVELS,
  LLM_PROVIDERS,
  LLM_PROVIDER_KEY_VAR,
  LLM_PROVIDER_LABELS,
  LLM_TASKS,
  LLM_TASK_HINTS,
  LLM_TASK_LABELS,
  isLlmTask,
  isMockEnv,
  llmEnvOverrides,
  parseLlmSettings,
  resolveLlmSettings,
  validateLlmSettings,
  type LlmEffortLevel,
  type LlmEnvOverrides,
  type LlmProvider,
  type LlmSettings,
  type LlmTask,
} from "@/lib/settings/llm";
import { getLlmSettingsForUser } from "@/server/settings-queries";

/**
 * The AI-model settings, for a given user: what the server actions and the
 * `/api/v1/settings/llm` routes both call, so the rules live in one place.
 */

export type UpdateLlmSettingsResult =
  | { ok: true; settings: LlmSettings }
  | { ok: false; errors: string[] };

export type TestLlmSettingsResult =
  | { ok: true; model: string; ms: number; sample: string }
  | { ok: false; code: "invalid" | "not-configured" | "rate-limited" | "llm"; error: string };

/**
 * Upserts the settings row. A partial payload only changes what it names, so
 * picking one model does not reset the other two.
 *
 * Read and write happen under one lock per user: two changes sent together
 * (the provider, then a model a moment later) would otherwise both start from
 * the same row and the second write would undo the first.
 */
export async function updateLlmSettingsForUser(userId: string, input: unknown): Promise<UpdateLlmSettingsResult> {
  const validated = validateLlmSettings(input);
  if (!validated.ok) return validated;

  const patch = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const patchModels = (
    typeof patch.models === "object" && patch.models !== null ? patch.models : {}
  ) as Record<string, unknown>;

  const next = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`settings:${userId}`}))`);
    const [row] = await tx
      .select({ llm: settings.llm })
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);
    const stored = row ? parseLlmSettings(row.llm) : DEFAULT_LLM_SETTINGS;

    const next: LlmSettings = {
      provider: patch.provider === undefined ? stored.provider : validated.value.provider,
      effort: patch.effort === undefined ? stored.effort : validated.value.effort,
      models: {
        outfits: patchModels.outfits === undefined ? stored.models.outfits : validated.value.models.outfits,
        taste: patchModels.taste === undefined ? stored.models.taste : validated.value.models.taste,
        vision: patchModels.vision === undefined ? stored.models.vision : validated.value.models.vision,
      },
    };

    await tx
      .insert(settings)
      .values({ userId, llm: next })
      .onConflictDoUpdate({
        target: settings.userId,
        set: { llm: next, updatedAt: new Date() },
      });
    return next;
  });

  return { ok: true, settings: next };
}

/* ------------------------------------------------------------------ */
/* What the native app's screen needs                                 */
/* ------------------------------------------------------------------ */

export interface LlmSettingsPayload {
  /** What a model call will use: the person's choice with the environment on top. */
  settings: LlmSettings;
  /** What the person picked, pins aside. */
  chosen: LlmSettings;
  /** Which fields the environment holds, by variable name. */
  pinned: LlmEnvOverrides;
  /**
   * `modelPrefix`: the ids a provider can call (Anthropic is called directly,
   * so only `anthropic/…`); null for any.
   */
  providers: Array<{
    id: LlmProvider;
    label: string;
    keyVar: string | null;
    configured: boolean;
    modelPrefix: string | null;
  }>;
  tasks: Array<{ id: LlmTask; label: string; hint: string; needsVision: boolean }>;
  effortLevels: LlmEffortLevel[];
}

/** The vocabulary comes along, so the app never hard-codes a provider or task. */
export function llmSettingsPayload(chosen: LlmSettings): LlmSettingsPayload {
  const configured: Record<LlmProvider, boolean> = {
    openrouter: isOpenRouterConfigured(),
    anthropic: isAnthropicConfigured(),
    mock: true,
  };
  return {
    settings: resolveLlmSettings(chosen, process.env),
    chosen,
    pinned: llmEnvOverrides(process.env),
    providers: LLM_PROVIDERS.map((id) => ({
      id,
      label: LLM_PROVIDER_LABELS[id],
      keyVar: LLM_PROVIDER_KEY_VAR[id],
      configured: configured[id],
      modelPrefix: id === "anthropic" ? "anthropic/" : null,
    })),
    tasks: LLM_TASKS.map((id) => ({
      id,
      label: LLM_TASK_LABELS[id],
      hint: LLM_TASK_HINTS[id],
      needsVision: id === "vision",
    })),
    effortLevels: [...LLM_EFFORT_LEVELS],
  };
}

/* ------------------------------------------------------------------ */
/* Test                                                                */
/* ------------------------------------------------------------------ */

const pingSchema = z.object({
  ok: z.boolean(),
  word: z.string(),
});

const PING_SYSTEM =
  "You answer with structured data only. Follow the schema exactly and add nothing else.";

const PING_USER = 'Reply with {"ok": true, "word": <one word of your choosing>}.';

/**
 * A 16x16 PNG. The vision test sends a real picture, because "the model is
 * listed as multimodal" and "this key can send this model an image" are not the
 * same claim.
 */
const PING_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAIElEQVR4nGP49Ok7SYhhkGuQserHikY10FfDIEwaxCAAROFdnxPa/rEAAAAASUVORK5CYII=";

const PING_VISION_USER =
  'Look at this picture and reply with {"ok": true, "word": the colour of the square in it}.';

/**
 * One test per user, task and model at a time: tapping Test again joins the
 * running call. Keyed by the model too, so a test started after a change of
 * model never gets the previous model's answer.
 */
const testing = new Map<string, Promise<TestLlmSettingsResult>>();

/**
 * Each test spends the server's key, so a person gets a handful per ten
 * minutes: enough to try every task after a few changes, not a loop.
 * In memory, so a restart forgets; it is a brake, not a budget.
 */
export const TEST_LIMIT = 20;
const TEST_WINDOW_MS = 10 * 60 * 1000;
const recentTests = new Map<string, number[]>();

function takeTestSlot(userId: string): boolean {
  const now = Date.now();
  const recent = (recentTests.get(userId) ?? []).filter((at) => now - at < TEST_WINDOW_MS);
  if (recent.length >= TEST_LIMIT) {
    recentTests.set(userId, recent);
    return false;
  }
  recent.push(now);
  recentTests.set(userId, recent);
  return true;
}

/**
 * Runs the smallest possible real call against the model configured for one
 * task. Returns how long it took and what came back, so the screen can show
 * evidence rather than a green tick.
 */
export async function testLlmSettingsForUser(userId: string, task: unknown): Promise<TestLlmSettingsResult> {
  if (!isLlmTask(task)) return { ok: false, code: "invalid", error: "Unknown task." };
  const resolved = await getLlmSettingsForUser(userId);
  const key = JSON.stringify([userId, task, resolved.provider, resolved.models[task]]);
  const running = testing.get(key);
  if (running) return running;
  // Only a call that would reach a model counts.
  if (resolved.provider !== "mock" && providerConfigured(resolved).ok && !takeTestSlot(userId)) {
    return { ok: false, code: "rate-limited", error: "That is a lot of tests. Try again in a few minutes." };
  }
  const started = runTest(task, resolved).finally(() => testing.delete(key));
  testing.set(key, started);
  return started;
}

async function runTest(task: LlmTask, resolved: LlmSettings): Promise<TestLlmSettingsResult> {
  if (resolved.provider === "mock") {
    return {
      ok: false,
      code: "not-configured",
      error: isMockEnv(process.env)
        ? "LLM_MOCK is set on the server, so no model is called and there is nothing to test."
        : "The mock provider makes no calls. Switch to OpenRouter or Anthropic to test a model.",
    };
  }

  const configured = providerConfigured(resolved);
  if (!configured.ok) return { ok: false, code: "not-configured", error: configured.error };

  const user: UserContent =
    task === "vision"
      ? [
          { type: "text", text: PING_VISION_USER },
          { type: "image", mime: "image/png", base64: PING_IMAGE_BASE64 },
        ]
      : PING_USER;

  const started = Date.now();
  const result = await callStructured(
    {
      task,
      system: PING_SYSTEM,
      user,
      schema: pingSchema,
      schemaName: "ping",
      maxTokens: 256,
      effort: "low",
    },
    resolved,
  );
  const ms = Date.now() - started;

  if (!result.ok) {
    return { ok: false, code: result.code === "not-configured" ? "not-configured" : "llm", error: result.error };
  }

  return {
    ok: true,
    model: result.model,
    ms,
    sample: `ok: ${result.value.ok}, word: ${result.value.word}`.slice(0, 120),
  };
}
