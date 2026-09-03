import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { looks } from "@/db/schema";
import type { OutfitSlots, WeatherSnapshot } from "@/domain";
import { requireUser } from "@/lib/session";

type LookRow = typeof looks.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** An outfit the user saved, as read back from the database. */
export interface Look {
  id: string;
  name: string;
  slots: OutfitSlots;
  why: string;
  tip: string | null;
  styleId: string | null;
  occasion: string | null;
  weather: WeatherSnapshot | null;
  generationId: string | null;
  wornCount: number;
  lastWornAt: Date | null;
  createdAt: Date;
}

export function rowToLook(row: LookRow): Look {
  return {
    id: row.id,
    name: row.name,
    slots: row.slots as OutfitSlots,
    why: row.why,
    tip: row.tip ?? null,
    styleId: row.styleId ?? null,
    occasion: row.occasion ?? null,
    weather: (row.weather as WeatherSnapshot | null) ?? null,
    generationId: row.generationId ?? null,
    wornCount: row.wornCount,
    lastWornAt: row.lastWornAt ?? null,
    createdAt: row.createdAt,
  };
}

/** Active looks, newest first. */
export async function listLooks(): Promise<Look[]> {
  const currentUser = await requireUser();
  const rows = await db
    .select()
    .from(looks)
    .where(and(eq(looks.userId, currentUser.id), isNull(looks.archivedAt)))
    .orderBy(desc(looks.createdAt));

  return rows.map(rowToLook);
}

export async function getLook(id: string): Promise<Look | null> {
  const currentUser = await requireUser();
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select()
    .from(looks)
    .where(and(eq(looks.id, id), eq(looks.userId, currentUser.id), isNull(looks.archivedAt)))
    .limit(1);

  return row ? rowToLook(row) : null;
}
