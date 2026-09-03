"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Image as ImageIcon, Loader2 } from "lucide-react";

import { InsetGroup, Row, RowIcon, SectionFooter, SectionHeader } from "@/components/shell";
import { Input } from "@/components/ui/input";
import { createInspoFromImage, createInspoFromUrl } from "@/server/inspo";
import { inspoErrorMessage, SCREENSHOT_HINT } from "@/components/inspo/labels";

/** Long side of the picture that actually gets uploaded. */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.82;

type Problem = { message: string; hint?: string };

/**
 * Shrinks a camera-sized photo before it goes over the wire. Anything the
 * browser cannot draw (an odd format, a canvas that refuses) falls back to the
 * original file, so the upload never fails just because the resize did.
 */
async function shrink(file: File): Promise<File> {
  try {
    if (!file.type.startsWith("image/")) return file;
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * A link that cannot be fetched has one reliable way out: screenshot the pin.
 * The server sometimes says that already in its own words, and saying it twice
 * reads like a stutter — so the hint only goes on when nothing else offers one.
 */
function problemFor(code: string, message?: string): Problem {
  const text = inspoErrorMessage(code, message);
  const stuck = code === "fetch" || code === "too-large";
  return stuck && !/instead/i.test(text) ? { message: text, hint: SCREENSHOT_HINT } : { message: text };
}

/**
 * The two ways a picture gets in: a pasted link, or a photo from the camera or
 * the library. Both land on the same detail page, where the analysis finishes.
 */
export function AddInspo({ initialErrorCode }: { initialErrorCode?: string }) {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [linkProblem, setLinkProblem] = useState<Problem | null>(
    initialErrorCode ? problemFor(initialErrorCode) : null,
  );
  const [photoProblem, setPhotoProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState<"link" | "photo" | null>(null);
  const [progress, setProgress] = useState("");

  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  async function addLink() {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setLinkProblem(null);
    setBusy("link");
    const result = await createInspoFromUrl({ url: trimmed });
    if (!result.ok) {
      setLinkProblem(problemFor(result.code, result.error));
      setBusy(null);
      return;
    }
    router.push(`/inspo/${result.inspo.id}`);
  }

  async function addPhoto(file: File | undefined) {
    if (!file || busy) return;
    setPhotoProblem(null);
    setBusy("photo");
    setProgress("Preparing the picture…");

    const prepared = await shrink(file);
    setProgress("Uploading…");

    const form = new FormData();
    form.append("image", prepared);
    const result = await createInspoFromImage(form);

    if (!result.ok) {
      setPhotoProblem(problemFor(result.code, result.error));
      setBusy(null);
      setProgress("");
      return;
    }
    router.push(`/inspo/${result.inspo.id}`);
  }

  return (
    <div className="space-y-6 pt-2">
      <section>
        <SectionHeader>Link</SectionHeader>
        <InsetGroup>
          <div className="flex min-h-11 items-center gap-2 py-1.5 pl-4 pr-2">
            <Input
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addLink();
                }
              }}
              placeholder="Paste a Pinterest or image link"
              aria-label="Picture link"
              className="h-11 flex-1 border-0 bg-transparent px-0 text-body shadow-none focus-visible:ring-0"
            />
            <button
              type="button"
              onClick={() => void addLink()}
              disabled={!url.trim() || busy !== null}
              className="flex h-11 shrink-0 items-center gap-1.5 px-2 text-body text-tint transition-opacity duration-150 active:opacity-60 disabled:text-label-3"
            >
              {busy === "link" ? (
                <Loader2 size={16} strokeWidth={2} className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : null}
              Add
            </button>
          </div>
        </InsetGroup>
        {linkProblem ? (
          <SectionFooter className="text-destructive">
            {linkProblem.message}
            {linkProblem.hint ? ` ${linkProblem.hint}` : ""}
          </SectionFooter>
        ) : null}
      </section>

      <section>
        <SectionHeader>Photo</SectionHeader>
        <InsetGroup>
          <Row
            leading={
              <RowIcon>
                <Camera aria-hidden />
              </RowIcon>
            }
            title="Take a photo"
            chevron
            disabled={busy !== null}
            onClick={() => cameraInput.current?.click()}
          />
          <Row
            leading={
              <RowIcon>
                <ImageIcon aria-hidden />
              </RowIcon>
            }
            title="Choose from library"
            chevron
            disabled={busy !== null}
            onClick={() => libraryInput.current?.click()}
          />
        </InsetGroup>

        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void addPhoto(file);
          }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void addPhoto(file);
          }}
        />

        {busy === "photo" ? (
          <SectionFooter aria-live="polite">{progress}</SectionFooter>
        ) : photoProblem ? (
          <SectionFooter className="text-destructive">
            {photoProblem.message}
            {photoProblem.hint ? ` ${photoProblem.hint}` : ""}
          </SectionFooter>
        ) : null}
      </section>

      <SectionFooter>
        On Android you can also share a picture straight to Fitsss from Pinterest.
      </SectionFooter>
    </div>
  );
}
