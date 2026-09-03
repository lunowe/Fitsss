"use client";

import { useState } from "react";
import { Sheet } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customColor, isLightHex, normalizeHex, type BlockColor } from "@/domain";
import { cn } from "@/lib/utils";

const DEFAULT_HEX = "#8e8e93";

/**
 * Sheet for adding a colour the palette does not cover. The hex can be typed
 * or picked with the native colour picker, which sits invisibly over the
 * preview swatch so the swatch itself is the tap target.
 *
 * Every custom colour starts from a clean slate — the fields are reset on the
 * way out, so two customs never share a hex.
 */
export function CustomColorSheet({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (color: BlockColor) => void;
}) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState(DEFAULT_HEX);
  const [preview, setPreview] = useState(DEFAULT_HEX);

  const color = customColor(name, hex);

  function changeHex(next: string) {
    setHex(next);
    // Keep the last valid colour on screen while a hex is half-typed.
    const normalized = normalizeHex(next);
    if (normalized) setPreview(normalized);
  }

  function close(next: boolean) {
    if (!next) {
      setName("");
      setHex(DEFAULT_HEX);
      setPreview(DEFAULT_HEX);
    }
    onOpenChange(next);
  }

  function submit() {
    if (!color) return;
    onAdd(color);
    close(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title="Custom color"
      description="For anything the palette does not cover."
      footer={
        <Button className="w-full" disabled={!color} onClick={submit}>
          Add color
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "relative size-16 shrink-0 rounded-full",
              isLightHex(preview) && "ring-1 ring-inset ring-separator",
            )}
            style={{ background: preview }}
          >
            <input
              type="color"
              aria-label="Pick a color"
              value={preview}
              onChange={(e) => changeHex(e.target.value)}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name, e.g. Dusty rose"
              maxLength={40}
              autoComplete="off"
            />
            <Input
              value={hex}
              onChange={(e) => changeHex(e.target.value)}
              placeholder="#rrggbb"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              className="font-mono tabular-nums"
              aria-invalid={!color}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
        </div>
        <p className="text-footnote text-label-2">
          {color ? `Filed under ${color.family}. Tap the circle to pick visually.` : "Enter a hex like #7a5230."}
        </p>
      </div>
    </Sheet>
  );
}
