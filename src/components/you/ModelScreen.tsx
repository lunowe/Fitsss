"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { InsetGroup, Row, SectionFooter, SectionHeader, SegmentedControl } from "@/components/shell";
import { Button } from "@/components/ui/button";
import type { ModelInfo } from "@/lib/llm/models";
import {
  LLM_EFFORT_LEVELS,
  LLM_PROVIDERS,
  LLM_PROVIDER_LABELS,
  LLM_TASKS,
  LLM_TASK_LABELS,
  type LlmEffortLevel,
  type LlmEnvOverrides,
  type LlmProvider,
  type LlmSettings,
  type LlmTask,
} from "@/lib/settings/llm";
import { testLlmSettings, updateLlmSettings } from "@/server/settings";
import { ModelPickerSheet } from "./ModelPickerSheet";

/** Whether each provider will find a credential, resolved on the server. */
export interface ProviderKeyStatus {
  openrouter: boolean;
  anthropic: boolean;
}

/** What `updateLlmSettings` accepts: only what changed. */
type LlmSettingsPatch = {
  provider?: LlmProvider;
  effort?: LlmEffortLevel;
  models?: Partial<Record<LlmTask, string>>;
};

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; model: string; ms: number; sample: string }
  | { status: "error"; error: string };

const PROVIDER_OPTIONS = LLM_PROVIDERS.map((value) => ({
  value,
  label: LLM_PROVIDER_LABELS[value],
}));

const EFFORT_OPTIONS = LLM_EFFORT_LEVELS.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));

const TEST_LABELS: Record<LlmTask, string> = {
  outfits: "Test outfits model",
  taste: "Test taste model",
  vision: "Test picture model",
};

function keyFootnote(provider: LlmProvider, keys: ProviderKeyStatus): string {
  switch (provider) {
    case "openrouter":
      return keys.openrouter
        ? "OPENROUTER_API_KEY found in the environment."
        : "OPENROUTER_API_KEY not set: add it to .env.local.";
    case "anthropic":
      return keys.anthropic
        ? "ANTHROPIC_API_KEY found in the environment."
        : "ANTHROPIC_API_KEY not set: add it to .env.local.";
    case "mock":
      return "Deterministic fake outfits, no API calls.";
  }
}

/**
 * Which model answers which question.
 *
 * Everything on this screen saves the moment it is touched — there is no Done
 * button, because a settings screen that can be left half-applied is a settings
 * screen that lies. The test buttons are the point of the page: a model that is
 * listed as supporting structured output and a model that actually answers in
 * the right shape are different claims, and only one of them can be checked.
 */
export function ModelScreen({
  settings,
  overrides,
  keys,
  models,
}: {
  settings: LlmSettings;
  overrides: LlmEnvOverrides;
  keys: ProviderKeyStatus;
  models: ModelInfo[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(settings);
  const [picking, setPicking] = useState<LlmTask | null>(null);
  const [tests, setTests] = useState<Record<LlmTask, TestState>>({
    outfits: { status: "idle" },
    taste: { status: "idle" },
    vision: { status: "idle" },
  });

  function save(patch: LlmSettingsPatch, previous: LlmSettings, message: string) {
    startTransition(async () => {
      const result = await updateLlmSettings(patch);
      if (!result.ok) {
        setCurrent(previous);
        toast.error(result.errors[0] ?? "That could not be saved.");
        return;
      }
      setCurrent(result.settings);
      toast.success(message);
      router.refresh();
    });
  }

  function setProvider(provider: LlmProvider) {
    if (provider === current.provider) return;
    const previous = current;
    setCurrent({ ...current, provider });
    save({ provider }, previous, `Using ${LLM_PROVIDER_LABELS[provider]}.`);
  }

  function setEffort(effort: LlmEffortLevel) {
    if (effort === current.effort) return;
    const previous = current;
    setCurrent({ ...current, effort });
    save({ effort }, previous, `Effort set to ${effort}.`);
  }

  function setModel(task: LlmTask, id: string) {
    setPicking(null);
    if (id === current.models[task]) return;
    const previous = current;
    setCurrent({ ...current, models: { ...current.models, [task]: id } });
    setTests((state) => ({ ...state, [task]: { status: "idle" } }));
    save({ models: { [task]: id } }, previous, `${LLM_TASK_LABELS[task]} now uses ${id}.`);
  }

  function runTest(task: LlmTask) {
    setTests((state) => ({ ...state, [task]: { status: "running" } }));
    startTransition(async () => {
      const result = await testLlmSettings(task);
      setTests((state) => ({
        ...state,
        [task]: result.ok
          ? { status: "ok", model: result.model, ms: result.ms, sample: result.sample }
          : { status: "error", error: result.error },
      }));
    });
  }

  const providerPinned = overrides.provider;
  const effortPinned = overrides.effort;

  return (
    <div className="space-y-6 px-4 pt-2">
      <section>
        <SectionHeader>Provider</SectionHeader>
        <InsetGroup>
          <div className="px-4 py-2.5">
            <SegmentedControl
              label="Provider"
              value={current.provider}
              options={PROVIDER_OPTIONS}
              // "OpenRouter" is one character too wide for the default padding.
              className="w-full [&_button]:px-1"
              disabled={Boolean(providerPinned)}
              onValueChange={setProvider}
            />
          </div>
        </InsetGroup>
        <SectionFooter>
          {keyFootnote(current.provider, keys)}
          {providerPinned ? ` Pinned by ${providerPinned} in the environment.` : ""}
        </SectionFooter>
      </section>

      <section>
        <SectionHeader>Models</SectionHeader>
        <InsetGroup>
          {LLM_TASKS.map((task) => {
            const pin = overrides.models[task];
            // A pinned model is shown, not offered: picking would change nothing.
            // The footnote names the variable; the row has room for the id only.
            return pin ? (
              <Row key={task} title={LLM_TASK_LABELS[task]} subtitle={current.models[task]} />
            ) : (
              <Row
                key={task}
                title={LLM_TASK_LABELS[task]}
                subtitle={current.models[task]}
                onClick={() => setPicking(task)}
                chevron
              />
            );
          })}
        </InsetGroup>
        <SectionFooter>
          {current.provider === "mock"
            ? providerPinned
              ? "The mock provider ignores these."
              : "The mock provider ignores these; they come back when you switch to a real one."
            : current.provider === "anthropic"
              ? "Called through the Anthropic SDK, so the anthropic/ prefix is dropped on the way out."
              : "Picture reading only lists models that can take an image."}
          {LLM_TASKS.some((task) => overrides.models[task])
            ? ` Pinned by ${[...new Set(LLM_TASKS.map((task) => overrides.models[task]).filter(Boolean))].join(", ")} in the environment.`
            : ""}
        </SectionFooter>
      </section>

      <section>
        <SectionHeader>Effort</SectionHeader>
        <InsetGroup>
          <div className="px-4 py-2.5">
            <SegmentedControl
              label="Effort"
              value={current.effort}
              options={EFFORT_OPTIONS}
              className="w-full"
              disabled={Boolean(effortPinned)}
              onValueChange={setEffort}
            />
          </div>
        </InsetGroup>
        <SectionFooter>
          How long the model may think before answering. Higher means better outfits, a longer
          wait and a bigger bill.
          {effortPinned ? ` Pinned by ${effortPinned} in the environment.` : ""}
        </SectionFooter>
      </section>

      <section>
        <SectionHeader>Test</SectionHeader>
        <div className="space-y-3">
          {LLM_TASKS.map((task) => {
            const state = tests[task];
            return (
              <div key={task} className="space-y-1.5">
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={pending || state.status === "running" || current.provider === "mock"}
                  onClick={() => runTest(task)}
                >
                  {state.status === "running" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Testing {LLM_TASK_LABELS[task].toLowerCase()}…
                    </>
                  ) : (
                    TEST_LABELS[task]
                  )}
                </Button>
                {state.status === "ok" ? (
                  <p className="px-4 text-footnote text-label-2">
                    <span className="text-success">Answered</span> in{" "}
                    <span className="tabular-nums">{(state.ms / 1000).toFixed(1)}s</span> ·{" "}
                    {state.model} · {state.sample}
                  </p>
                ) : null}
                {state.status === "error" ? (
                  <p className="px-4 text-footnote text-destructive">{state.error}</p>
                ) : null}
              </div>
            );
          })}
        </div>
        <SectionFooter>
          {current.provider === "mock"
            ? "The mock provider makes no calls, so there is nothing to test."
            : "One tiny structured call per task, against the model above. Real key, real request."}
        </SectionFooter>
      </section>

      {picking ? (
        <ModelPickerSheet
          task={picking}
          provider={current.provider}
          current={current.models[picking]}
          models={models}
          open
          onOpenChange={(open) => {
            if (!open) setPicking(null);
          }}
          onPick={(id) => setModel(picking, id)}
        />
      ) : null}
    </div>
  );
}
