import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { inspos } from "@/db/schema";
import type { Inspo, InspoAnalysis, InspoMatch } from "@/domain";
import { isUuid } from "@/lib/llm/generation-request";
import { requireUser } from "@/lib/session";

/**
 * Read side of inspiration pictures. The image bytes are never selected here:
 * a listing that dragged four megabytes of JPEG through the server component
 * boundary would be unusable, so the picture is served separately by
 * /api/inspo/[id]/image and referenced as a URL.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isInspoId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Every column except the bytes. */
export const inspoColumns = {
  id: inspos.id,
  sourceUrl: inspos.sourceUrl,
  mime: inspos.mime,
  width: inspos.width,
  height: inspos.height,
  analysis: inspos.analysis,
  match: inspos.match,
  styleId: inspos.styleId,
  note: inspos.note,
  createdAt: inspos.createdAt,
} as const;

export type InspoRow = {
  id: string;
  sourceUrl: string | null;
  mime: string;
  width: number;
  height: number;
  analysis: unknown;
  match: unknown;
  styleId: string | null;
  note: string | null;
  createdAt: Date;
};

export function inspoImageUrl(id: string): string {
  return `/api/inspo/${id}/image`;
}

export function rowToInspo(row: InspoRow): Inspo {
  return {
    id: row.id,
    sourceUrl: row.sourceUrl,
    imageUrl: inspoImageUrl(row.id),
    width: row.width,
    height: row.height,
    analysis: (row.analysis as InspoAnalysis | null) ?? null,
    match: (row.match as InspoMatch | null) ?? null,
    styleId: row.styleId,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* By user id — usable from scripts and from generation                */
/* ------------------------------------------------------------------ */

export async function listInsposForUser(userId: string): Promise<Inspo[]> {
  const rows = await db
    .select(inspoColumns)
    .from(inspos)
    .where(eq(inspos.userId, userId))
    .orderBy(desc(inspos.createdAt));
  return rows.map(rowToInspo);
}

export async function getInspoForUser(userId: string, id: string): Promise<Inspo | null> {
  if (!isInspoId(id)) return null;
  const [row] = await db
    .select(inspoColumns)
    .from(inspos)
    .where(and(eq(inspos.id, id), eq(inspos.userId, userId)))
    .limit(1);
  return row ? rowToInspo(row) : null;
}

export async function listInsposForStyleAndUser(
  userId: string,
  styleId: string,
  limit = 20,
): Promise<Inspo[]> {
  if (!isUuid(styleId)) return [];
  const rows = await db
    .select(inspoColumns)
    .from(inspos)
    .where(and(eq(inspos.userId, userId), eq(inspos.styleId, styleId)))
    .orderBy(desc(inspos.createdAt))
    .limit(limit);
  return rows.map(rowToInspo);
}

/** The stored bytes, for the image route only. */
export async function loadInspoImage(
  userId: string,
  id: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!isInspoId(id)) return null;
  const [row] = await db
    .select({ image: inspos.image, mime: inspos.mime })
    .from(inspos)
    .where(and(eq(inspos.id, id), eq(inspos.userId, userId)))
    .limit(1);
  return row ? { bytes: row.image, mime: row.mime } : null;
}

/* ------------------------------------------------------------------ */
/* Session-scoped queries — the contract the UI reads                  */
/* ------------------------------------------------------------------ */

/** Newest first. */
export async function listInspos(): Promise<Inspo[]> {
  const currentUser = await requireUser();
  return listInsposForUser(currentUser.id);
}

export async function getInspo(id: string): Promise<Inspo | null> {
  const currentUser = await requireUser();
  return getInspoForUser(currentUser.id, id);
}

export async function listInsposForStyle(styleId: string): Promise<Inspo[]> {
  const currentUser = await requireUser();
  return listInsposForStyleAndUser(currentUser.id, styleId);
}
