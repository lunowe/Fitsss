"use client";

import { Sparkles, Upload } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Silhouette } from "@/components/silhouettes";
import { Button } from "@/components/ui/button";
import { generatePieceArt, keepGeneratedArt } from "@/server/art";
import { deletePieceArt, setPieceArt } from "@/server/content";

import { Field } from "./fields";

const STAGES = ["Reading the brief", "Drawing", "Cleaning up the lines"] as const;

/** A generated drawing waiting for the owner's verdict. */
type Preview = { svg: string; viewBox: string; body: string; model: string; ms: number; costUsd: number };

/**
 * The artwork controls shared by the built-in and the custom piece type
 * sheets: upload an SVG, have the model draw one, or drop the override and
 * fall back to what shipped.
 */
export function ArtRow({
  typeId,
  artId,
  source,
  disabled = false,
}: {
  typeId: string;
  /** Id of the stored override, when this type already has one. */
  artId: string | null;
  source: string | null;
  /** New types have no id yet, so there is nothing to attach a drawing to. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [drawing, startDrawing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [stage, setStage] = useState(0);

  // The drawing call runs one to three minutes; advance an honest status line
  // on a timer so the wait reads as progress rather than a hang.
  useEffect(() => {
    if (!drawing) return;
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 25_000);
    return () => clearInterval(timer);
  }, [drawing]);

  function upload(chosen: File | undefined) {
    if (!chosen) return;
    setError(null);
    startTransition(async () => {
      const svg = await chosen.text();
      const result = await setPieceArt({ typeId, svg, source: "uploaded" });
      if (!result.ok) {
        setError(result.errors[0] ?? "That file did not work");
        return;
      }
      toast("Artwork updated");
      router.refresh();
    });
  }

  function reset() {
    if (!artId) return;
    startTransition(async () => {
      const result = await deletePieceArt(artId);
      if (!result.ok) {
        setError(result.errors[0] ?? "Could not remove that artwork");
        return;
      }
      toast("Back to the built-in drawing");
      router.refresh();
    });
  }

  function generate() {
    setError(null);
    setStage(0);
    startDrawing(async () => {
      const result = await generatePieceArt({ typeId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview({ svg: result.svg, viewBox: result.viewBox, body: result.body, model: result.model, ms: result.ms, costUsd: result.costUsd });
    });
  }

  function keep() {
    if (!preview) return;
    startTransition(async () => {
      const result = await keepGeneratedArt({ typeId, svg: preview.svg });
      if (!result.ok) {
        setError(result.errors[0] ?? "Could not save that drawing");
        return;
      }
      setPreview(null);
      toast("Artwork updated");
      router.refresh();
    });
  }

  const busy = pending || drawing;

  return (
    <Field
      label="Artwork"
      hint={
        disabled
          ? "Save this piece type first, then give it a drawing."
          : artId
            ? `Your own drawing${source ? ` (${source})` : ""}. Reset to fall back to the built-in one.`
            : "Upload an SVG of the flat garment, or let the model draw one. Colours are rewritten so the piece takes on its own colour."
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-[10px] bg-card-2">
          <Silhouette typeId={typeId} color="var(--color-label-3)" size={44} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={file}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" disabled={disabled || busy} onClick={() => file.current?.click()}>
            <Upload size={16} aria-hidden />
            {artId ? "Replace artwork" : "Upload artwork"}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" disabled={disabled || busy} onClick={generate}>
              <Sparkles size={16} aria-hidden />
              {artId ? "Draw another" : "Generate"}
            </Button>
            {artId ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={reset}>
                Reset to built-in
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {drawing ? (
        <p className="mt-2 text-footnote text-label-2" aria-live="polite">
          {STAGES[stage]}… this takes a minute or two.
        </p>
      ) : null}

      {preview ? (
        <div className="mt-3 rounded-xl bg-card-2 p-3">
          <div className="flex items-center gap-3">
            <PreviewGlyph viewBox={preview.viewBox} body={preview.body} color="#1f2a44" />
            <PreviewGlyph viewBox={preview.viewBox} body={preview.body} color="#ffffff" />
            <PreviewGlyph viewBox={preview.viewBox} body={preview.body} color="#6b6b3a" small />
            <div className="min-w-0 flex-1 text-footnote text-label-2">
              Drawn in {Math.round(preview.ms / 1000)} s
              {preview.costUsd > 0 ? ` · about $${preview.costUsd.toFixed(2)}` : ""}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" disabled={busy} onClick={keep}>
              Use this
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={generate}>
              Try again
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPreview(null)}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1.5 text-footnote text-destructive">
          {error}
        </p>
      ) : null}
    </Field>
  );
}

/** Renders a generated drawing tinted like the app would, before it is stored. */
function PreviewGlyph({ viewBox, body, color, small = false }: { viewBox: string; body: string; color: string; small?: boolean }) {
  const light = color === "#ffffff";
  const size = small ? 32 : 56;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[8px] bg-card"
      style={{ width: size + 12, height: size + 12 }}
    >
      <svg
        viewBox={viewBox}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
        style={{
          ["--icon-fill" as string]: color,
          ["--icon-fill-2" as string]: light ? "#d9d9d9" : color,
          ["--icon-stroke" as string]: light ? "rgb(0 0 0 / 0.62)" : "rgb(0 0 0 / 0.62)",
        }}
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </span>
  );
}
