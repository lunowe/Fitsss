import { data, invalid, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { llmSettingsPayload, updateLlmSettingsForUser } from "@/server/settings-core";
import { getStoredLlmSettings } from "@/server/settings-queries";

/**
 * GET /api/v1/settings/llm — `{ settings, chosen, pinned, providers, tasks,
 * effortLevels }`: the provider, per-task models and effort a model call will
 * use (`settings`), what the person picked (`chosen`), which of those the
 * server's environment holds (`pinned`, by variable name), and the
 * vocabulary to show them with.
 */
export const GET = withUser(async (_request, user) => {
  return data(llmSettingsPayload(await getStoredLlmSettings(user.id)));
});

/**
 * PATCH /api/v1/settings/llm — `{ provider?, effort?, models?: { [task]: id } }`.
 * Changes only what it names; answers like GET.
 */
export const PATCH = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const value = body.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid(["Send the settings to change as an object."]);
  }
  const models = (value as { models?: unknown }).models;
  if (models !== undefined && (typeof models !== "object" || models === null || Array.isArray(models))) {
    return invalid(["models must map a task to a model id."]);
  }

  const result = await updateLlmSettingsForUser(user.id, value);
  if (!result.ok) return invalid(result.errors);
  return data(llmSettingsPayload(result.settings));
});
