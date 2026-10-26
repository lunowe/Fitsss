import { data } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { SUGGESTED_MODELS, listOpenRouterModels } from "@/lib/llm/models";

/**
 * GET /api/v1/settings/llm/models — `{ models: ModelInfo[], suggested: [id] }`:
 * every OpenRouter model that can be asked for a JSON schema, and the curated
 * ids to list first (only those still offered). An unreachable OpenRouter
 * answers an empty list, not an error.
 */
export const GET = withUser(async () => {
  const models = await listOpenRouterModels();
  const offered = new Set(models.map((model) => model.id));
  return data({ models, suggested: SUGGESTED_MODELS.filter((id) => offered.has(id)) });
});
