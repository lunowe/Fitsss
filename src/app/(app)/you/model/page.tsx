import type { Metadata } from "next";

import { BackButton, LargeTitleHeader, Screen } from "@/components/shell";
import { ModelScreen } from "@/components/you/ModelScreen";
import { listOpenRouterModels } from "@/lib/llm/models";
import { isAnthropicConfigured } from "@/lib/llm/providers/anthropic";
import { isOpenRouterConfigured } from "@/lib/llm/providers/openrouter-env";
import { getLlmEnvOverrides, getLlmSettings } from "@/server/settings-queries";

export const metadata: Metadata = {
  title: "AI model",
};

/**
 * The catalogue is fetched here rather than in the sheet: it is cached for ten
 * minutes in the server process, so the picker opens instantly and an
 * unreachable OpenRouter degrades to an empty list instead of a spinner that
 * never resolves.
 */
export default async function ModelPage() {
  const [settings, models] = await Promise.all([getLlmSettings(), listOpenRouterModels()]);

  return (
    <Screen>
      <LargeTitleHeader
        leading={<BackButton href="/you" label="You" />}
        title="AI model"
        subtitle={`${models.length || "No"} models available`}
      />
      <ModelScreen
        settings={settings}
        overrides={getLlmEnvOverrides()}
        keys={{ openrouter: isOpenRouterConfigured(), anthropic: isAnthropicConfigured() }}
        models={models}
      />
    </Screen>
  );
}
