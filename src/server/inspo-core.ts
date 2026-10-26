import "server-only";

import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, inspos, styles } from "@/db/schema";
import {
  applyCatalogExtension,
  cleanText,
  clipText,
  hasVisibleText,
  type Block,
  type Inspo,
  type InspoAnalysis,
  type InspoMatch,
} from "@/domain";
import {
  INSPO_INSTRUCTION,
  INSPO_SYSTEM_PROMPT,
  buildMockAnalysis,
  buildVocabulary,
  detectImageMime,
  inspoAnalysisSchema,
  looksComplete,
  matchInspoToCloset,
  normalizeAnalysis,
  readImageInfo,
  resolveImageUrl,
  type ImageMime,
} from "@/lib/inspo";
import { callStructured, providerConfigured, type StructuredErrorCode } from "@/lib/llm/provider";
import { isUuid } from "@/lib/llm/generation-request";
import { rowToBlock } from "@/server/blocks-queries";
import { loadCatalogExtension } from "@/server/catalog-queries";
import { getLlmSettingsForUser } from "@/server/settings-queries";
import {
  getInspoForUser,
  inspoColumns,
  isInspoId,
  listInsposForStyleAndUser,
  rowToInspo,
} from "@/server/inspo-queries";

/**
 * Inspiration pictures: ingest, vision analysis, closet matching.
 *
 * Lives outside the "use server" boundary for the same reason generate-core
 * does — it takes a user id, so scripts/try-inspo.ts can drive the whole flow
 * without a browser, and the thin actions in inspo.ts only resolve the session.
 */

export type InspoErrorCode = "invalid" | "fetch" | "not-configured" | "llm" | "too-large" | "not-found";
export type InspoError = { ok: false; error: string; code: InspoErrorCode };
export type InspoResult = { ok: true; inspo: Inspo } | InspoError;

/** Uploads are resized on the client; anything past this is a bug or an attack. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Reference looks pulled into a style's prompt. */
export const MAX_STYLE_REFERENCES = 4;
export const MAX_NOTE_LENGTH = 500;

const MAX_TOKENS = 3000;

function fail(code: InspoErrorCode, error: string): InspoError {
  return { ok: false, code, error };
}

/** Provider codes, narrowed to the two this screen distinguishes. */
function toInspoCode(code: StructuredErrorCode): InspoErrorCode {
  return code === "not-configured" ? "not-configured" : "llm";
}

async function loadActiveBlocks(userId: string): Promise<Block[]> {
  const rows = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.userId, userId), isNull(blocks.archivedAt)));
  return rows.map(rowToBlock);
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

/** A stored picture: new, or the one already there with the same bytes. */
export type StoreInspoResult = { ok: true; inspo: Inspo; existing: boolean } | InspoError;

/** Only a web link is kept as the source: it may be shown as one. */
function cleanSourceUrl(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? cleanText(value).trim() : "";
  if (!text || text.length > 2048) return null;
  try {
    const url = new URL(text);
    if (url.username || url.password) return null;
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Stores the bytes, unless this person already has exactly this picture:
 * then that one comes back. A retried upload whose answer was lost, a
 * double tap or the same pin shared twice all end as one inspo.
 */
async function insertInspo(
  userId: string,
  input: { bytes: Buffer; mime: ImageMime; width: number; height: number; sourceUrl: string | null },
): Promise<{ inspo: Inspo; existing: boolean }> {
  const imageHash = createHash("sha256").update(input.bytes).digest("hex");
  return db.transaction(async (tx) => {
    // Two sends of the same picture take turns, so the second finds the first.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`inspo:${userId}:${imageHash}`}))`);
    const [found] = await tx
      .select(inspoColumns)
      .from(inspos)
      .where(and(eq(inspos.userId, userId), eq(inspos.imageHash, imageHash)))
      .limit(1);
    if (found) return { inspo: rowToInspo(found), existing: true };

    const [row] = await tx
      .insert(inspos)
      .values({
        userId,
        sourceUrl: input.sourceUrl,
        image: input.bytes,
        imageHash,
        mime: input.mime,
        width: input.width,
        height: input.height,
      })
      .returning(inspoColumns);
    return { inspo: rowToInspo(row), existing: false };
  });
}

/**
 * Imports a picture from a link: a direct image URL, or a page that declares
 * one (a Pinterest pin, a lookbook post). Stores it unread; the analysis is
 * a separate, slow step.
 */
export async function storeInspoFromUrlForUser(userId: string, url: string): Promise<StoreInspoResult> {
  const link = typeof url === "string" ? cleanText(url).trim() : "";
  if (!link) return fail("invalid", "Paste a link first.");
  const resolved = await resolveImageUrl(link);
  if (!resolved.ok) return fail(resolved.code, resolved.error);

  const { bytes, mime, width, height, imageUrl } = resolved.image;
  const sourceUrl = cleanSourceUrl(link) ?? cleanSourceUrl(imageUrl);
  return { ok: true, ...(await insertInspo(userId, { bytes, mime, width, height, sourceUrl })) };
}

/**
 * Stores an already-resized upload, unread. The mime and the dimensions come
 * from the bytes themselves, never from what the client claimed.
 */
export async function storeInspoFromImageForUser(
  userId: string,
  input: { bytes: Buffer; sourceUrl?: string | null },
): Promise<StoreInspoResult> {
  const { bytes } = input;
  if (!bytes || bytes.byteLength === 0) return fail("invalid", "That file is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return fail("too-large", "That picture is too big. Pick a smaller one.");
  }
  if (!detectImageMime(bytes)) {
    return fail("invalid", "That file is not a JPEG, PNG, WebP or GIF.");
  }
  const info = readImageInfo(bytes);
  if (!info || !looksComplete(bytes, info.mime)) return fail("invalid", "That picture could not be read.");

  return {
    ok: true,
    ...(await insertInspo(userId, {
      bytes,
      mime: info.mime,
      width: info.width,
      height: info.height,
      sourceUrl: cleanSourceUrl(input.sourceUrl),
    })),
  };
}

/** Stored, then read straight away: what the web's add screen waits for. */
async function storeThenAnalyze(userId: string, stored: StoreInspoResult): Promise<InspoResult> {
  if (!stored.ok) return stored;
  // A picture added before comes back as it is, unless it was never read.
  if (stored.existing && stored.inspo.analysis) return { ok: true, inspo: stored.inspo };
  return analyzeInspoForUser(userId, stored.inspo.id);
}

/** A link imported and analysed in one go, so it comes back ready to look at. */
export async function createInspoFromUrlForUser(userId: string, url: string): Promise<InspoResult> {
  return storeThenAnalyze(userId, await storeInspoFromUrlForUser(userId, url));
}

/** An upload stored and analysed in one go. */
export async function createInspoFromImageForUser(
  userId: string,
  input: { bytes: Buffer; sourceUrl?: string | null },
): Promise<InspoResult> {
  return storeThenAnalyze(userId, await storeInspoFromImageForUser(userId, input));
}

/* ------------------------------------------------------------------ */
/* Analyse                                                             */
/* ------------------------------------------------------------------ */

/**
 * Looks at the picture and matches what it sees against the closet. Safe to
 * re-run: the newest analysis and match replace whatever was stored, which is
 * what makes "re-analyse" a sensible button after the closet has grown.
 */
export async function analyzeInspoForUser(userId: string, id: string): Promise<InspoResult> {
  if (!isInspoId(id)) return fail("not-found", "That picture is gone.");
  // Two screens (or two devices) opening the same unread picture share one
  // model call instead of paying for two and racing to store them.
  const key = `${userId}:${id.toLowerCase()}`;
  const running = analysing.get(key);
  if (running) return running;
  const analysis = runAnalysis(userId, id).finally(() => analysing.delete(key));
  analysing.set(key, analysis);
  return analysis;
}

/** Analyses in progress in this process, by user and picture. */
const analysing = new Map<string, Promise<InspoResult>>();

async function runAnalysis(userId: string, id: string): Promise<InspoResult> {

  const [row] = await db
    .select({ id: inspos.id, image: inspos.image, mime: inspos.mime })
    .from(inspos)
    .where(and(eq(inspos.id, id), eq(inspos.userId, userId)))
    .limit(1);
  if (!row) return fail("not-found", "That picture is gone.");

  const llm = await getLlmSettingsForUser(userId);
  const mock = llm.provider === "mock";
  if (!mock) {
    const configured = providerConfigured(llm);
    if (!configured.ok) return fail("not-configured", configured.error);
  }

  const owned = await loadActiveBlocks(userId);
  // The catalog registry is process-global, and while this waits (on the
  // database, on the model) another request swaps in its own user's. So this
  // user's is applied right before each stretch that reads it, and those
  // stretches are synchronous.
  const extension = await loadCatalogExtension(userId);

  let analysis: InspoAnalysis;
  let match: InspoMatch;
  if (mock) {
    applyCatalogExtension(extension);
    analysis = buildMockAnalysis(owned);
    match = matchInspoToCloset(analysis, owned);
  } else {
    const info = readImageInfo(row.image);
    if (!info) return fail("invalid", "That picture could not be read.");

    applyCatalogExtension(extension);
    const vocabulary = buildVocabulary();

    // Vocabulary, then the picture, then the instruction — the same order the
    // system prompt describes, so the model reads the rules before the image.
    const answer = await callStructured(
      {
        task: "vision",
        system: INSPO_SYSTEM_PROMPT,
        user: [
          { type: "text", text: vocabulary },
          { type: "image", mime: info.mime, base64: row.image.toString("base64") },
          { type: "text", text: INSPO_INSTRUCTION },
        ],
        schema: inspoAnalysisSchema,
        schemaName: "inspo_analysis",
        maxTokens: MAX_TOKENS,
      },
      llm,
    );

    if (!answer.ok) {
      if (answer.code === "refusal") {
        return fail("llm", "That picture was declined. Try another one.");
      }
      return fail(toInspoCode(answer.code), answer.error);
    }

    applyCatalogExtension(extension);
    analysis = normalizeAnalysis(answer.value, answer.model);
    if (analysis.pieces.length === 0) {
      return fail("llm", "No clothes were found in that picture. Try one with the whole outfit in frame.");
    }
    match = matchInspoToCloset(analysis, owned);
  }

  const [updated] = await db
    .update(inspos)
    .set({ analysis, match, updatedAt: new Date() })
    .where(and(eq(inspos.id, id), eq(inspos.userId, userId)))
    .returning(inspoColumns);

  return updated ? { ok: true, inspo: rowToInspo(updated) } : fail("not-found", "That picture is gone.");
}

/* ------------------------------------------------------------------ */
/* Edit and delete                                                     */
/* ------------------------------------------------------------------ */

/** Saving a picture as a reference for a style. Passing null unfiles it. */
export async function setInspoStyleForUser(
  userId: string,
  input: { id: string; styleId: string | null },
): Promise<InspoResult> {
  const { id, styleId } = input ?? {};
  if (!isInspoId(id)) return fail("not-found", "That picture is gone.");

  if (styleId !== null) {
    if (!isUuid(styleId)) return fail("invalid", "That is not a style.");
    // A deleted style is archived, not gone: it can't take new references.
    const [style] = await db
      .select({ id: styles.id })
      .from(styles)
      .where(and(eq(styles.id, styleId), eq(styles.userId, userId), isNull(styles.archivedAt)))
      .limit(1);
    // "invalid", not "not-found": the picture is still there.
    if (!style) return fail("invalid", "That style is gone.");
  }

  const [row] = await db
    .update(inspos)
    .set({ styleId, updatedAt: new Date() })
    .where(and(eq(inspos.id, id), eq(inspos.userId, userId)))
    .returning(inspoColumns);
  return row ? { ok: true, inspo: rowToInspo(row) } : fail("not-found", "That picture is gone.");
}

export async function setInspoNoteForUser(
  userId: string,
  input: { id: string; note: string },
): Promise<InspoResult> {
  const { id } = input ?? {};
  if (!isInspoId(id)) return fail("not-found", "That picture is gone.");
  const cleaned = typeof input?.note === "string" ? clipText(cleanText(input.note).trim(), MAX_NOTE_LENGTH) : "";
  // Nothing but zero-width characters is no note at all.
  const note = hasVisibleText(cleaned) ? cleaned : "";

  const [row] = await db
    .update(inspos)
    .set({ note: note || null, updatedAt: new Date() })
    .where(and(eq(inspos.id, id), eq(inspos.userId, userId)))
    .returning(inspoColumns);
  return row ? { ok: true, inspo: rowToInspo(row) } : fail("not-found", "That picture is gone.");
}

export async function deleteInspoForUser(userId: string, id: string): Promise<{ ok: boolean }> {
  if (!isInspoId(id)) return { ok: false };
  const rows = await db
    .delete(inspos)
    .where(and(eq(inspos.id, id), eq(inspos.userId, userId)))
    .returning({ id: inspos.id });
  return { ok: rows.length > 0 };
}

/* ------------------------------------------------------------------ */
/* Generation support                                                  */
/* ------------------------------------------------------------------ */

/** The inspo a restyle is based on, only when it has actually been analysed. */
export async function loadAnalyzedInspo(userId: string, inspoId: string): Promise<Inspo | null> {
  const inspo = await getInspoForUser(userId, inspoId);
  return inspo?.analysis ? inspo : null;
}

/** Summary lines of the pictures saved as references for a style. */
export async function styleReferenceLines(userId: string, styleId: string): Promise<string[]> {
  const saved = await listInsposForStyleAndUser(userId, styleId, MAX_STYLE_REFERENCES * 3);
  const lines: string[] = [];
  for (const inspo of saved) {
    const summary = inspo.analysis?.summary?.trim();
    if (!summary || lines.includes(summary)) continue;
    lines.push(summary);
    if (lines.length >= MAX_STYLE_REFERENCES) break;
  }
  return lines;
}
