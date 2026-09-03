import { MAX_LEARNED_AVOID, MAX_LEARNED_LINES, normalizeLineText } from "./lines";
import { topFavorites, topSkipped } from "./affinity";
import type { BlockAffinity } from "./types";

/**
 * Deterministic stand-in for the summarizer, used only when `LLM_MOCK=1`.
 * The counted pieces become the lines, so the merge and the storage are
 * exercised end to end without an API key.
 */
export function mockTasteLines(
  aff: Map<string, BlockAffinity>,
  labels: Map<string, string>,
): { lines: { text: string; evidence: number }[]; avoid: { text: string; evidence: number }[] } {
  const write = (row: BlockAffinity, verb: "Reaches for" | "Avoids") => {
    const label = labels.get(row.blockId);
    if (!label) return null;
    const evidence =
      verb === "Reaches for"
        ? row.wears + row.saves + row.likes + row.swapsIn
        : row.dislikes + row.swapsOut;
    const text = normalizeLineText(`${verb} ${label}`);
    return text ? { text, evidence: Math.max(1, evidence) } : null;
  };

  const keep = (line: { text: string; evidence: number } | null): line is { text: string; evidence: number } =>
    Boolean(line);

  return {
    lines: topFavorites(aff, MAX_LEARNED_LINES)
      .map((row) => write(row, "Reaches for"))
      .filter(keep),
    avoid: topSkipped(aff, MAX_LEARNED_AVOID)
      .map((row) => write(row, "Avoids"))
      .filter(keep),
  };
}
