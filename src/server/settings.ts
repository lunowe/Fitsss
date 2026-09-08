"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod/v4";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { callStructured, providerConfigured, type UserContent } from "@/lib/llm/provider";
import { requireUser } from "@/lib/session";
import {
  isLlmTask,
  llmEnvOverrides,
  validateLlmSettings,
  type LlmSettings,
  type LlmTask,
} from "@/lib/settings/llm";
import { getLlmSettingsForUser, getStoredLlmSettings } from "@/server/settings-queries";

/**
 * Write side of the AI-model screen: save the choice, and prove it works.
 *
 * The test is a real call with a real key — a "supported" badge in a list means
 * nothing until a model has actually answered in the right shape, which is the
 * one thing that decides whether a generation will work later.
 */

export type UpdateLlmSettingsResult =
  | { ok: true; settings: LlmSettings }
  | { ok: false; errors: string[] };

export type TestLlmSettingsResult =
  | { ok: true; model: string; ms: number; sample: string }
  | { ok: false; error: string };

/**
 * Upserts the settings row. A partial payload only changes what it names, so
 * picking one model does not reset the other two.
 */
export async function updateLlmSettings(input: unknown): Promise<UpdateLlmSettingsResult> {
  const currentUser = await requireUser();

  const validated = validateLlmSettings(input);
  if (!validated.ok) return validated;

  const stored = await getStoredLlmSettings(currentUser.id);
  const patch = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const patchModels = (
    typeof patch.models === "object" && patch.models !== null ? patch.models : {}
  ) as Record<string, unknown>;

  const next: LlmSettings = {
    provider: patch.provider === undefined ? stored.provider : validated.value.provider,
    effort: patch.effort === undefined ? stored.effort : validated.value.effort,
    models: {
      outfits: patchModels.outfits === undefined ? stored.models.outfits : validated.value.models.outfits,
      taste: patchModels.taste === undefined ? stored.models.taste : validated.value.models.taste,
      vision: patchModels.vision === undefined ? stored.models.vision : validated.value.models.vision,
    },
  };

  await db
    .insert(settings)
    .values({ userId: currentUser.id, llm: next })
    .onConflictDoUpdate({
      target: settings.userId,
      set: { llm: next, updatedAt: new Date() },
    });

  revalidatePath("/you/model");
  revalidatePath("/today");

  return { ok: true, settings: next };
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
 * Runs the smallest possible real call against the model configured for one
 * task. Returns how long it took and what came back, so the screen can show
 * evidence rather than a green tick.
 */
export async function testLlmSettings(task: unknown): Promise<TestLlmSettingsResult> {
  const currentUser = await requireUser();
  if (!isLlmTask(task)) return { ok: false, error: "Unknown task." };

  const resolved = await getLlmSettingsForUser(currentUser.id);

  if (resolved.provider === "mock") {
    return {
      ok: false,
      error: "The mock provider makes no calls. Switch to OpenRouter or Anthropic to test a model.",
    };
  }

  const configured = providerConfigured(resolved);
  if (!configured.ok) return { ok: false, error: configured.error };

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
      task: task as LlmTask,
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

  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    model: result.model,
    ms,
    sample: `ok: ${result.value.ok}, word: ${result.value.word}`.slice(0, 120),
  };
}

/** Which settings the environment has pinned. Read by the screen on demand. */
export async function readLlmEnvOverrides() {
  await requireUser();
  return llmEnvOverrides(process.env);
}
