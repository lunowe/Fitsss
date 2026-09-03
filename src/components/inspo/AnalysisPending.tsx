"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { InsetGroup } from "@/components/shell";
import { analyzeInspo } from "@/server/inspo";
import { inspoErrorMessage } from "@/components/inspo/labels";

/**
 * A picture arrives before its analysis does. This runs the read once, then
 * refreshes the page so the server renders the finished thing.
 */
export function AnalysisPending({ id }: { id: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    void (async () => {
      const result = await analyzeInspo(id);
      if (cancelled) return;
      if (!result.ok) {
        setProblem(inspoErrorMessage(result.code, result.error));
        return;
      }
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [id, router, attempt]);

  return (
    <div className="px-4">
      <InsetGroup>
        {problem ? (
          <div className="px-4 py-3">
            <p className="text-subhead text-label-2">{problem}</p>
            <button
              type="button"
              onClick={() => {
                setProblem(null);
                started.current = false;
                setAttempt((n) => n + 1);
              }}
              className="mt-1 min-h-11 text-body text-tint transition-opacity duration-150 active:opacity-60"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex min-h-11 items-center gap-3 px-4 py-3" aria-live="polite">
            <Loader2
              size={18}
              strokeWidth={2}
              className="shrink-0 animate-spin text-label-2 motion-reduce:animate-none"
              aria-hidden
            />
            <span className="text-body text-label-2">Reading the picture…</span>
          </div>
        )}
      </InsetGroup>
    </div>
  );
}
