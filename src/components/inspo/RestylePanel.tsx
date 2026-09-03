"use client";

import { useEffect, useState, useTransition } from "react";
import { Bookmark, Lightbulb, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { OutfitFlatLay, OutfitPieceList } from "@/components/outfit";
import { InsetGroup, Row, SectionHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import type { Block, GenerationResult, Outfit } from "@/domain";
import { restyleFromInspo } from "@/server/inspo";
import { saveLook } from "@/server/looks";

/** Honest, in order: this is what the server is actually doing. */
const STAGES = ["Reading your closet", "Checking the weather", "Composing looks"];

const COUNT = 2;

function ResultCard({
  outfit,
  blocks,
  result,
}: {
  outfit: Outfit;
  blocks: Block[];
  result: GenerationResult;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    if (saved || pending) return;
    startTransition(async () => {
      const response = await saveLook({
        outfit,
        generationId: result.id,
        styleId: result.request.styleId,
        occasion: result.request.occasion,
        weather: result.request.weather,
      });
      if (!response.ok) {
        toast(response.errors[0] ?? "Could not save this look");
        return;
      }
      setSaved(true);
      toast("Saved to Looks");
    });
  }

  return (
    <article className="rounded-xl bg-card p-3">
      <OutfitFlatLay blocks={blocks} slots={outfit.slots} size="lg" />

      <div className="px-1 pt-3">
        <h3 className="text-title-3">{outfit.name}</h3>
        {outfit.why ? <p className="mt-1 text-callout text-label-2">{outfit.why}</p> : null}
        {outfit.tip ? (
          <p className="mt-2 flex items-start gap-1.5 text-footnote text-label-2">
            <Lightbulb size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
            <span>{outfit.tip}</span>
          </p>
        ) : null}
      </div>

      <OutfitPieceList blocks={blocks} slots={outfit.slots} className="mt-3 bg-card-2" />

      <Button variant="secondary" className="mt-3 w-full" onClick={save} disabled={pending || saved}>
        <Bookmark size={18} strokeWidth={1.75} aria-hidden />
        {saved ? "Saved" : "Save to Looks"}
      </Button>
    </article>
  );
}

/**
 * Two outfits from the user's own closet, in the spirit of the picture. The
 * button stays put after the results so a second take is one tap away.
 */
export function RestylePanel({ inspoId, blocks }: { inspoId: string; blocks: Block[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 1100);
    return () => clearInterval(timer);
  }, [pending]);

  function restyle() {
    setError(null);
    setStage(0);
    startTransition(async () => {
      const response = await restyleFromInspo({ inspoId, count: COUNT });
      if (!response.ok) {
        setError({ code: response.code, message: response.error });
        return;
      }
      setResult(response.result);
    });
  }

  return (
    <section>
      <SectionHeader>In this spirit</SectionHeader>
      <div className="px-4">
        <Button className="w-full" onClick={restyle} disabled={pending}>
          {pending ? (
            <Loader2 size={18} strokeWidth={2} className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Sparkles size={18} strokeWidth={1.75} aria-hidden />
          )}
          {pending ? "Styling…" : result ? "Style it again" : "Style it from my closet"}
        </Button>

        {pending ? (
          <p className="mt-3 text-center text-footnote text-label-2" aria-live="polite">
            {STAGES[stage]}…
          </p>
        ) : null}

        {error ? (
          <InsetGroup className="mt-3">
            <div className="px-4 py-3 text-subhead text-label-2">
              {error.code === "not-configured"
                ? "Add ANTHROPIC_API_KEY to .env.local and restart the server."
                : error.message}
            </div>
            {error.code === "too-few-pieces" || error.code === "empty-closet" ? (
              <Row title="Add pieces" href="/closet/add" />
            ) : null}
          </InsetGroup>
        ) : null}

        {result && !pending ? (
          <div className="mt-3 space-y-3">
            {result.outfits.map((outfit) => (
              <ResultCard key={outfit.id} outfit={outfit} blocks={blocks} result={result} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
