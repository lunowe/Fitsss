import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { styles } from "@/db/schema";
import { requireUser } from "@/lib/session";

type StyleRow = typeof styles.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A style the user actually wears, as read back from the database. */
export interface Style {
  id: string;
  name: string;
  description: string;
  /** Hard rules, one per line. Null when the user left it empty. */
  rules: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export function rowToStyle(row: StyleRow): Style {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rules: row.rules ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Active styles for the signed-in user, in the order the user arranged them. */
export async function listStyles(): Promise<Style[]> {
  const currentUser = await requireUser();
  const rows = await db
    .select()
    .from(styles)
    .where(and(eq(styles.userId, currentUser.id), isNull(styles.archivedAt)))
    .orderBy(asc(styles.sortOrder), asc(styles.createdAt));

  return rows.map(rowToStyle);
}

export async function getStyle(id: string): Promise<Style | null> {
  const currentUser = await requireUser();
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select()
    .from(styles)
    .where(and(eq(styles.id, id), eq(styles.userId, currentUser.id), isNull(styles.archivedAt)))
    .limit(1);

  return row ? rowToStyle(row) : null;
}
