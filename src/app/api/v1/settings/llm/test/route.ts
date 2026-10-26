import { data, failure, invalid, readJson } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { testLlmSettingsForUser } from "@/server/settings-core";

/**
 * POST /api/v1/settings/llm/test — `{ task }`. One tiny real call against the
 * model set for that task: `{ model, ms, sample }`. 503 `not_configured` for
 * the mock provider or a missing key, 502 `test_failed` when the model did
 * not answer in shape (the message says how), 429 `rate_limited` after
 * twenty tests in ten minutes.
 */
export const POST = withUser(async (request, user) => {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const result = await testLlmSettingsForUser(user.id, (body.value as { task?: unknown } | null)?.task);
  if (result.ok) return data({ model: result.model, ms: result.ms, sample: result.sample });
  switch (result.code) {
    case "invalid":
      return invalid([result.error]);
    case "not-configured":
      return failure(503, "not_configured", result.error);
    case "rate-limited":
      return failure(429, "rate_limited", result.error);
    case "llm":
      return failure(502, "test_failed", result.error);
  }
});
