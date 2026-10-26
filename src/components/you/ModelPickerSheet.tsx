"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { Sheet } from "@/components/shell";
import { Input } from "@/components/ui/input";
import type { ModelInfo } from "@/lib/llm/models";
import { SUGGESTED_MODELS } from "@/lib/llm/models";
import { LLM_TASK_HINTS, LLM_TASK_LABELS, type LlmProvider, type LlmTask } from "@/lib/settings/llm";
import { cn } from "@/lib/utils";

/** Beyond this the list stops being a list and starts being a scroll. */
const MAX_ROWS = 60;

function price(perMillion: number): string {
  if (perMillion < 0) return "varies";
  if (perMillion === 0) return "free";
  if (perMillion < 1) return `$${perMillion.toFixed(2)}`;
  if (perMillion < 100) return `$${perMillion.toFixed(2)}`;
  return `$${Math.round(perMillion)}`;
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded bg-fill px-1.5 py-px text-caption text-label-2">{children}</span>
  );
}

function ModelRow({
  model,
  selected,
  onPick,
}: {
  model: ModelInfo;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-start gap-3 py-2.5 text-left transition-colors duration-100 active:bg-fill"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-body text-label">{model.name}</div>
        <div className="truncate text-footnote text-label-2">{model.id}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-caption tabular-nums text-label-2">
            {model.promptPricePerM < 0
              ? "Price varies with the model it picks"
              : `${price(model.promptPricePerM)} in · ${price(model.completionPricePerM)} out / 1M`}
          </span>
          {model.vision ? <Badge>vision</Badge> : null}
          {model.reasoning ? <Badge>reasoning</Badge> : null}
        </div>
      </div>
      <div className="flex h-6 w-5 shrink-0 items-center justify-center">
        {selected ? <Check size={18} strokeWidth={2.5} className="text-tint" aria-hidden /> : null}
      </div>
    </button>
  );
}

/**
 * Picks one model for one task.
 *
 * The curated ids come first, then everything OpenRouter offers that can be
 * asked for a JSON schema. Picture reading only ever lists models that take an
 * image, because picking a text-only one there produces a failure much later
 * and much less legibly.
 */
export function ModelPickerSheet({
  task,
  provider,
  current,
  models,
  open,
  onOpenChange,
  onPick,
}: {
  task: LlmTask;
  provider: LlmProvider;
  current: string;
  models: ModelInfo[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: string) => void;
}) {
  // The sheet is mounted only while it is open, so the search resets itself.
  const [query, setQuery] = useState("");

  const eligible = useMemo(() => {
    let rows = models;
    // A text-only model cannot read a picture, however good it is otherwise.
    if (task === "vision") rows = rows.filter((model) => model.vision);
    // Called through the SDK, so only what Anthropic itself serves: not
    // OpenRouter's variants of it (`:batch`, `:free`).
    if (provider === "anthropic") {
      rows = rows.filter((model) => model.id.startsWith("anthropic/") && !model.id.includes(":"));
    }
    return rows;
  }, [models, provider, task]);

  const { suggested, rest, hidden } = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? eligible.filter(
          (model) =>
            model.id.toLowerCase().includes(needle) || model.name.toLowerCase().includes(needle),
        )
      : eligible;

    const suggestedIds = new Set(SUGGESTED_MODELS);
    const suggested = SUGGESTED_MODELS.map((id) => matches.find((model) => model.id === id)).filter(
      (model): model is ModelInfo => Boolean(model),
    );
    const others = matches.filter((model) => !suggestedIds.has(model.id));
    return {
      suggested,
      rest: others.slice(0, MAX_ROWS),
      hidden: Math.max(0, others.length - MAX_ROWS),
    };
  }, [eligible, query]);

  const empty = suggested.length === 0 && rest.length === 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={LLM_TASK_LABELS[task]}
      description={LLM_TASK_HINTS[task]}
      className="h-[85svh]"
      bodyClassName="pb-2"
    >
      <div className="sticky top-0 z-10 -mx-4 bg-card px-4 pb-2 pt-1">
        <div className="relative">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-3"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search models"
            className="pl-9"
          />
        </div>
      </div>

      {models.length === 0 ? (
        <p className="py-6 text-center text-footnote text-label-2">
          The OpenRouter catalogue could not be loaded. Check your connection and reopen this
          screen.
        </p>
      ) : empty ? (
        <p className="py-6 text-center text-footnote text-label-2">
          No model matches “{query.trim()}”.
        </p>
      ) : null}

      {suggested.length ? (
        <section className="pt-1">
          <p className="pb-1 text-footnote font-medium uppercase tracking-[0.4px] text-label-2">
            Suggested
          </p>
          <div className="[&>*+*]:border-t [&>*+*]:border-separator">
            {suggested.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                selected={model.id === current}
                onPick={() => onPick(model.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {rest.length ? (
        <section className={cn("pt-4", suggested.length === 0 && "pt-1")}>
          <p className="pb-1 text-footnote font-medium uppercase tracking-[0.4px] text-label-2">
            All models
          </p>
          <div className="[&>*+*]:border-t [&>*+*]:border-separator">
            {rest.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                selected={model.id === current}
                onPick={() => onPick(model.id)}
              />
            ))}
          </div>
          {hidden ? (
            <p className="pt-3 text-footnote text-label-2">
              {hidden} more {hidden === 1 ? "model" : "models"} — narrow the search to see {hidden === 1 ? "it" : "them"}.
            </p>
          ) : null}
        </section>
      ) : null}
    </Sheet>
  );
}
