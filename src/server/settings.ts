"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { llmEnvOverrides, resolveLlmSettings } from "@/lib/settings/llm";
import {
  testLlmSettingsForUser,
  updateLlmSettingsForUser,
  type UpdateLlmSettingsResult,
} from "@/server/settings-core";

/**
 * Write side of the AI-model screen: save the choice, and prove it works.
 * The rules live in `settings-core.ts`, shared with `/api/v1/settings/llm`.
 *
 * The test is a real call with a real key — a "supported" badge in a list means
 * nothing until a model has actually answered in the right shape, which is the
 * one thing that decides whether a generation will work later.
 */

export type { UpdateLlmSettingsResult };

export type TestLlmSettingsResult =
  | { ok: true; model: string; ms: number; sample: string }
  | { ok: false; error: string };

/**
 * Upserts the settings row. A partial payload only changes what it names, so
 * picking one model does not reset the other two. Answers with the settings
 * in effect (the environment on top), which is what the screen shows.
 */
export async function updateLlmSettings(input: unknown): Promise<UpdateLlmSettingsResult> {
  const currentUser = await requireUser();
  const result = await updateLlmSettingsForUser(currentUser.id, input);
  if (!result.ok) return result;

  revalidatePath("/you/model");
  revalidatePath("/today");

  return { ok: true, settings: resolveLlmSettings(result.settings, process.env) };
}

/**
 * Runs the smallest possible real call against the model configured for one
 * task. Returns how long it took and what came back, so the screen can show
 * evidence rather than a green tick.
 */
export async function testLlmSettings(task: unknown): Promise<TestLlmSettingsResult> {
  const currentUser = await requireUser();
  const result = await testLlmSettingsForUser(currentUser.id, task);
  return result.ok ? result : { ok: false, error: result.error };
}

/** Which settings the environment has pinned. Read by the screen on demand. */
export async function readLlmEnvOverrides() {
  await requireUser();
  return llmEnvOverrides(process.env);
}
