import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { generations, looks, styles } from "@/db/schema";
import { isUuid } from "@/lib/llm/generation-request";

/**
 * The references a client sends along with an outfit (the style it was made
 * for, the generation and look it came from), kept only when they are the
 * user's own. Anything else becomes null: an id from another account, or one
 * deleted meanwhile on another device, must neither point at someone else's
 * data nor fail the write on its foreign key.
 */
export async function ownedRefs(
  userId: string,
  refs: { styleId?: unknown; generationId?: unknown; lookId?: unknown },
): Promise<{ styleId: string | null; generationId: string | null; lookId: string | null }> {
  const id = (value: unknown) => (typeof value === "string" && isUuid(value) ? value.toLowerCase() : null);
  const [styleId, generationId, lookId] = [id(refs.styleId), id(refs.generationId), id(refs.lookId)];

  const [style, generation, look] = await Promise.all([
    styleId
      ? db
          .select({ id: styles.id })
          .from(styles)
          // A deleted (archived) style is gone as far as new records go.
          .where(and(eq(styles.id, styleId), eq(styles.userId, userId), isNull(styles.archivedAt)))
          .limit(1)
      : [],
    generationId
      ? db
          .select({ id: generations.id })
          .from(generations)
          .where(and(eq(generations.id, generationId), eq(generations.userId, userId)))
          .limit(1)
      : [],
    lookId
      ? db.select({ id: looks.id }).from(looks).where(and(eq(looks.id, lookId), eq(looks.userId, userId))).limit(1)
      : [],
  ]);

  return {
    styleId: style.length ? styleId : null,
    generationId: generation.length ? generationId : null,
    lookId: look.length ? lookId : null,
  };
}
