import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { requireUser } from "@/lib/session";
import {
  DEFAULT_LLM_SETTINGS,
  llmEnvOverrides,
  parseLlmSettings,
  resolveLlmSettings,
  type LlmEnvOverrides,
  type LlmSettings,
} from "@/lib/settings/llm";

/**
 * Read side of per-user settings. The environment is layered on top here and
 * nowhere else, so a call site only ever sees the settings that will actually
 * be used.
 */

/** What the row holds, before the environment has its say. */
export async function getStoredLlmSettings(userId: string): Promise<LlmSettings> {
  const [row] = await db
    .select({ llm: settings.llm })
    .from(settings)
    .where(eq(settings.userId, userId))
    .limit(1);
  return row ? parseLlmSettings(row.llm) : DEFAULT_LLM_SETTINGS;
}

/** Stored settings with the environment on top. This is what providers get. */
export async function getLlmSettingsForUser(userId: string): Promise<LlmSettings> {
  return resolveLlmSettings(await getStoredLlmSettings(userId), process.env);
}

/** The same, for the signed-in user. For server components and actions. */
export async function getLlmSettings(): Promise<LlmSettings> {
  const currentUser = await requireUser();
  return getLlmSettingsForUser(currentUser.id);
}

/** Which fields the environment has taken over, so the screen can say so. */
export function getLlmEnvOverrides(): LlmEnvOverrides {
  return llmEnvOverrides(process.env);
}
