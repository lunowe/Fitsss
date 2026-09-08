/**
 * The cheap half of the review: everything about a drawing that can be
 * measured without looking at it.
 *
 * These catch the failure modes a vision model is least reliable about —
 * a part that floated off, a fill that never made it, forty stray slivers —
 * and they cost nothing, so they run on every attempt before any critique.
 */

import { boxArea, boxWidth, boxHeight, type Box } from "./geometry";
import { clusterCount, ICON_FILL, ICON_FILL_2, type NormalizeOk } from "./normalize";
import type { ArtInspection, ArtScores, ArtVerdict } from "./types";

/** More than this and the drawing is fussier than the rest of the set. */
export const MAX_ELEMENTS = 40;
/** Fewer than this and it is probably a blob. */
export const MIN_ELEMENTS = 2;

export function inspectArt(art: NormalizeOk): ArtInspection {
  const problems: string[] = [];
  const filled = art.paints.filter((p) => p.fill === ICON_FILL).length;
  const filled2 = art.paints.filter((p) => p.fill === ICON_FILL_2).length;
  const stroked = art.paints.filter((p) => p.stroke !== "none").length;
  const clusters = clusterCount(art.boxes);

  const [, , vw, vh] = art.viewBox.split(/\s+/).map(Number);
  const aspect = vw / vh;
  const view: Box = { x1: 0, y1: 0, x2: vw, y2: vh };
  const largest = art.boxes.reduce((max, box) => Math.max(max, boxArea(box)), 0);
  const largestShare = boxArea(view) > 0 ? largest / boxArea(view) : 0;

  if (art.elements > MAX_ELEMENTS) problems.push(`${art.elements} shapes, more than the ${MAX_ELEMENTS} the set allows`);
  if (art.elements < MIN_ELEMENTS) problems.push(`only ${art.elements} shape, too plain to read as a garment`);
  if (!filled) problems.push("no shape carries the body fill, so the piece would not take the garment colour");
  if (!stroked) problems.push("nothing is outlined");
  if (clusters > 1) problems.push(`${clusters} disconnected clusters of geometry: a part is floating off on its own`);
  if (aspect > 4 || aspect < 0.25) problems.push(`extreme aspect ratio ${aspect.toFixed(2)}`);
  if (largestShare < 0.25) problems.push("no shape covers a quarter of the box: the outline is probably broken up");

  // Slivers: shapes far below the median size are usually rounding debris.
  const areas = art.boxes.map((b) => Math.max(boxWidth(b), boxHeight(b))).sort((a, b) => a - b);
  const median = areas[Math.floor(areas.length / 2)] ?? 0;
  const slivers = areas.filter((a) => median > 0 && a < median * 0.05).length;
  if (slivers > 2) problems.push(`${slivers} near-invisible shapes`);

  // The sanitiser repairs each element on its own, so one habit ("no fill on
  // any of the seams") shows up once per shape. Count them, report them once.
  const repairs = new Map<string, number>();
  for (const warning of art.warnings) {
    if (!/off-palette|no fill|paint server|invisible|dropped <text/.test(warning)) continue;
    const kind = warning.replace(/<[a-z]+>/g, "a shape");
    repairs.set(kind, (repairs.get(kind) ?? 0) + 1);
  }
  for (const [kind, count] of repairs) problems.push(count > 1 ? `${kind} (${count} times)` : kind);

  return { elements: art.elements, clusters, aspect, filled, filled2, stroked, largestShare, problems };
}

/**
 * Combines the model verdict with the structural check.
 *
 * The model score carries the weight (it is the only thing that can tell a
 * skirt from a lampshade); structure only subtracts, one point per problem,
 * so a drawing that reads well but has a floating buckle still loses to a
 * clean one that reads equally well.
 */
export function scoreArt(inspection: ArtInspection, verdict: ArtVerdict | null): ArtScores {
  const model = verdict ? verdict.recognizable + verdict.styleMatch + verdict.cleanliness : 0;
  const penalty = Math.min(6, inspection.problems.length);
  return { verdict, inspection, total: model - penalty };
}

/** True when a drawing is good enough to stop iterating. */
export function isKeeper(scores: ArtScores): boolean {
  if (!scores.verdict) return scores.inspection.problems.length === 0;
  const { recognizable, styleMatch, cleanliness } = scores.verdict;
  return (
    scores.verdict.keep &&
    recognizable >= 4 &&
    styleMatch >= 4 &&
    cleanliness >= 4 &&
    scores.inspection.problems.length === 0
  );
}
