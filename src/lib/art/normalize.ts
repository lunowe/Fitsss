/**
 * Turns whatever a model returns into a drawing the app can render.
 *
 * Model output is untrusted markup, so nothing survives that is not on an
 * allow-list: no scripts, no external references, no CSS, no raster images.
 * What is left is rewritten into house style — the three tint variables, one
 * constant stroke width, `vector-effect="non-scaling-stroke"` — and cropped to
 * the art plus 4% padding on a 128-unit long side, the same shape
 * `scripts/import-icons.mjs` produces for the imported set.
 */

import { boxesOverlap, pathBox, transformBox, unionBox, type Box } from "./geometry";

export const ICON_FILL = "var(--icon-fill, #b3b3b3)";
export const ICON_FILL_2 = "var(--icon-fill-2, #8c8c8c)";
export const ICON_STROKE = "var(--icon-stroke, #000)";

/** Literal colours the prompt asks the model to draw with. */
export const DRAW_FILL = "#B3B3B3";
export const DRAW_FILL_2 = "#8C8C8C";

/** Shapes that may appear in a drawing. `g` is allowed as a wrapper only. */
const SHAPES = new Set(["path", "circle", "ellipse", "rect", "polygon", "polyline", "line"]);
const WRAPPERS = new Set(["g", "svg"]);
/** Dropped together with everything inside them, with a warning. */
const SKIPPED = new Set([
  "defs",
  "clippath",
  "mask",
  "pattern",
  "symbol",
  "marker",
  "lineargradient",
  "radialgradient",
  "text",
  "tspan",
  "textpath",
  "title",
  "desc",
  "metadata",
]);
/** Anything here means the whole answer is rejected rather than cleaned up. */
const FORBIDDEN = new Set([
  "script",
  "foreignobject",
  "image",
  "use",
  "style",
  "filter",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  "iframe",
  "a",
  "switch",
  "handler",
]);

const GEOMETRY_ATTRS = new Set([
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "width",
  "height",
  "points",
  "x1",
  "y1",
  "x2",
  "y2",
  "transform",
]);
const PAINT_ATTRS = new Set(["fill", "stroke", "stroke-width", "stroke-linejoin", "stroke-linecap", "fill-rule"]);

export interface NormalizeOptions {
  /** Padding around the art, as a fraction of the long side. */
  pad?: number;
  /** Long side of the output viewBox. */
  longSide?: number;
  /** Stroke width written on every stroked element. Matches the imported set. */
  strokeWidth?: number;
  /** Decimal places kept in the output. */
  precision?: number;
}

export interface NormalizeOk {
  ok: true;
  /** Full `<svg …>` document. */
  svg: string;
  viewBox: string;
  /** Inner markup, what `Silhouette` injects. */
  body: string;
  /** Bounding box of the art in the model's own coordinates. */
  box: Box;
  elements: number;
  /** Per-element boxes in output coordinates, for the quality check. */
  boxes: Box[];
  paints: Array<{ fill: string; stroke: string }>;
  warnings: string[];
}

export interface NormalizeFail {
  ok: false;
  errors: string[];
}

export type NormalizeResult = NormalizeOk | NormalizeFail;

/** Pulls the first complete `<svg>…</svg>` out of a chat answer. */
export function extractSvg(text: string): string | null {
  const fenced = /```(?:svg|xml|html)?\s*([\s\S]*?)```/i.exec(text);
  const haystack = fenced ? fenced[1] : text;
  const match = /<svg[\s\S]*?<\/svg\s*>/i.exec(haystack);
  if (match) return match[0];
  // A fence may have been opened and never closed.
  const open = /<svg[\s\S]*$/i.exec(haystack);
  return open && /<\/svg/i.test(open[0]) ? open[0] : null;
}

interface Tag {
  name: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
  closing: boolean;
}

/** A minimal, forgiving XML tag scanner. Good enough for generated markup. */
function* tags(svg: string): Generator<Tag> {
  const re = /<\s*(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(svg)) !== null) {
    const attrs: Record<string, string> = {};
    const attrRe = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let attr: RegExpExecArray | null;
    while ((attr = attrRe.exec(match[3])) !== null) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? "";
    }
    yield {
      name: match[2].toLowerCase(),
      attrs,
      selfClosing: match[4] === "/",
      closing: match[1] === "/",
    };
  }
}

const isBlack = (c: string) => /^(#000{1,3}|#000000|black|rgb\(0[,\s]+0[,\s]+0\)|currentcolor)$/i.test(c.trim());
const sameHex = (c: string, hex: string) => c.trim().toLowerCase() === hex.toLowerCase();

function round(value: number, precision: number): number {
  const k = 10 ** precision;
  return Math.round(value * k) / k;
}

/** Rewrites one element's paint attributes into the three tint variables. */
function repaint(
  name: string,
  attrs: Record<string, string>,
  warnings: string[],
): { fill: string; stroke: string } {
  const rawFill = attrs.fill?.trim();
  const rawStroke = attrs.stroke?.trim();

  let fill: string;
  if (!rawFill) {
    // No fill means black in SVG, which is never what the drawing meant. An
    // open path is a seam; a closed one is garment body.
    const open = name === "path" ? !/[zZ]\s*$/.test(attrs.d ?? "") : name === "line" || name === "polyline";
    fill = open ? "none" : ICON_FILL;
    warnings.push(`<${name}> had no fill; assumed ${open ? "none" : "body"}`);
  } else if (rawFill.toLowerCase() === "none" || rawFill.toLowerCase() === "transparent") {
    fill = "none";
  } else if (sameHex(rawFill, DRAW_FILL)) {
    fill = ICON_FILL;
  } else if (sameHex(rawFill, DRAW_FILL_2)) {
    fill = ICON_FILL_2;
  } else if (rawFill.startsWith("var(--icon-fill-2")) {
    fill = ICON_FILL_2;
  } else if (rawFill.startsWith("var(--icon-fill")) {
    fill = ICON_FILL;
  } else if (isBlack(rawFill)) {
    fill = ICON_STROKE;
    warnings.push(`black fill on <${name}> mapped to the outline colour`);
  } else if (rawFill.startsWith("url(")) {
    fill = ICON_FILL;
    warnings.push(`paint server fill on <${name}> replaced with the body colour`);
  } else {
    fill = ICON_FILL_2;
    warnings.push(`off-palette fill ${rawFill} on <${name}> mapped to the detail colour`);
  }

  let stroke: string;
  if (!rawStroke || rawStroke.toLowerCase() === "none") {
    stroke = "none";
  } else if (rawStroke.startsWith("var(--icon-stroke")) {
    stroke = ICON_STROKE;
  } else {
    if (!isBlack(rawStroke) && !rawStroke.startsWith("var(")) {
      warnings.push(`off-palette stroke ${rawStroke} on <${name}> mapped to the outline colour`);
    }
    stroke = ICON_STROKE;
  }

  if (fill === "none" && stroke === "none") {
    stroke = ICON_STROKE;
    warnings.push(`<${name}> was invisible; gave it an outline`);
  }
  return { fill, stroke };
}

/** Bounding box of a shape element in its own coordinates. */
function shapeBox(name: string, attrs: Record<string, string>): Box | null {
  const num = (key: string, fallback = 0) => {
    const value = Number.parseFloat(attrs[key] ?? "");
    return Number.isFinite(value) ? value : fallback;
  };
  let box: Box | null = null;
  if (name === "path") box = pathBox(attrs.d ?? "");
  else if (name === "circle") {
    const r = num("r");
    if (r > 0) box = { x1: num("cx") - r, y1: num("cy") - r, x2: num("cx") + r, y2: num("cy") + r };
  } else if (name === "ellipse") {
    const rx = num("rx");
    const ry = num("ry", num("rx"));
    if (rx > 0 && ry > 0) box = { x1: num("cx") - rx, y1: num("cy") - ry, x2: num("cx") + rx, y2: num("cy") + ry };
  } else if (name === "rect") {
    const w = num("width");
    const h = num("height");
    if (w > 0 && h > 0) box = { x1: num("x"), y1: num("y"), x2: num("x") + w, y2: num("y") + h };
  } else if (name === "line") {
    box = {
      x1: Math.min(num("x1"), num("x2")),
      y1: Math.min(num("y1"), num("y2")),
      x2: Math.max(num("x1"), num("x2")),
      y2: Math.max(num("y1"), num("y2")),
    };
  } else if (name === "polygon" || name === "polyline") {
    const nums = (attrs.points ?? "").split(/[\s,]+/).map(Number).filter(Number.isFinite);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      box = unionBox(box, { x1: nums[i], y1: nums[i + 1], x2: nums[i], y2: nums[i + 1] });
    }
  }
  return box && Number.isFinite(box.x1) ? box : null;
}

/**
 * Sanitises, repaints and re-crops one generated drawing.
 *
 * Returns `ok: false` with reasons when the answer is not usable at all:
 * no `<svg>`, forbidden markup, or no drawable geometry.
 */
export function normalizeArt(raw: string, options: NormalizeOptions = {}): NormalizeResult {
  const pad = options.pad ?? 0.04;
  const longSide = options.longSide ?? 128;
  const strokeWidth = options.strokeWidth ?? 1;
  const precision = options.precision ?? 2;

  const svg = extractSvg(raw);
  if (!svg) return { ok: false, errors: ["no <svg> element in the answer"] };

  const errors: string[] = [];
  const warnings: string[] = [];

  interface Kept {
    name: string;
    attrs: Record<string, string>;
    paint: { fill: string; stroke: string };
    box: Box;
  }
  const kept: Kept[] = [];
  // Wrapper <g>s, innermost last. Models routinely hang the shared stroke on a
  // group and leave the shapes bare, so paint is inherited as well as geometry.
  interface Frame {
    transform: string;
    fill?: string;
    stroke?: string;
  }
  const stack: Frame[] = [];
  let group = "";
  const inherited = (key: "fill" | "stroke"): string | undefined => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const value = stack[i][key];
      if (value !== undefined) return value;
    }
    return undefined;
  };
  let skipDepth = 0;

  for (const tag of tags(svg)) {
    if (skipDepth > 0) {
      if (SKIPPED.has(tag.name)) {
        if (tag.closing) skipDepth -= 1;
        else if (!tag.selfClosing) skipDepth += 1;
      }
      continue;
    }
    if (SKIPPED.has(tag.name)) {
      if (!tag.closing && !tag.selfClosing) skipDepth += 1;
      warnings.push(`dropped <${tag.name}>`);
      continue;
    }
    if (FORBIDDEN.has(tag.name)) {
      errors.push(`forbidden element <${tag.name}>`);
      continue;
    }
    if (WRAPPERS.has(tag.name)) {
      if (tag.name === "g") {
        if (tag.closing) {
          stack.pop();
        } else if (!tag.selfClosing) {
          stack.push({ transform: tag.attrs.transform ?? "", fill: tag.attrs.fill, stroke: tag.attrs.stroke });
        }
        group = stack
          .map((frame) => frame.transform)
          .filter(Boolean)
          .join(" ");
      }
      continue;
    }
    if (!SHAPES.has(tag.name) || tag.closing) continue;

    const own = shapeBox(tag.name, tag.attrs);
    if (!own) {
      warnings.push(`<${tag.name}> had no geometry and was dropped`);
      continue;
    }
    const combined = [group, tag.attrs.transform].filter(Boolean).join(" ");
    const box = transformBox(own, combined || undefined);
    if (box.x2 - box.x1 < 1e-6 && box.y2 - box.y1 < 1e-6) {
      warnings.push(`<${tag.name}> was a single point and was dropped`);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(tag.attrs)) {
      if (GEOMETRY_ATTRS.has(key)) attrs[key] = value;
      else if (PAINT_ATTRS.has(key)) attrs[key] = value;
      else if (key !== "vector-effect" && key !== "class" && key !== "id" && key !== "style") {
        warnings.push(`dropped ${key} on <${tag.name}>`);
      } else if (key === "style" || key === "class") {
        warnings.push(`dropped ${key} on <${tag.name}>`);
      }
    }
    if (combined) attrs.transform = combined;
    else delete attrs.transform;
    const painted: Record<string, string> = { ...tag.attrs };
    const groupFill = inherited("fill");
    const groupStroke = inherited("stroke");
    if (painted.fill === undefined && groupFill !== undefined) painted.fill = groupFill;
    if (painted.stroke === undefined && groupStroke !== undefined) painted.stroke = groupStroke;
    kept.push({ name: tag.name, attrs, paint: repaint(tag.name, painted, warnings), box });
  }

  if (errors.length) return { ok: false, errors };
  if (!kept.length) return { ok: false, errors: ["no drawable geometry"] };

  const art = kept.reduce<Box | null>((acc, el) => unionBox(acc, el.box), null);
  if (!art || art.x2 - art.x1 <= 0 || art.y2 - art.y1 <= 0) {
    return { ok: false, errors: ["art has no area"] };
  }

  const w = art.x2 - art.x1;
  const h = art.y2 - art.y1;
  const padding = Math.max(w, h) * pad;
  const crop = { x: art.x1 - padding, y: art.y1 - padding, w: w + 2 * padding, h: h + 2 * padding };
  const k = longSide / Math.max(crop.w, crop.h);
  const viewBox = `0 0 ${round(crop.w * k, precision)} ${round(crop.h * k, precision)}`;
  const transform = `translate(${round(-crop.x * k, 4)} ${round(-crop.y * k, 4)}) scale(${round(k, 6)})`;

  const parts = kept.map((el) => {
    const out: string[] = [];
    for (const key of ["d", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "points", "x1", "y1", "x2", "y2", "transform"]) {
      if (el.attrs[key] !== undefined) out.push(`${key}="${el.attrs[key]}"`);
    }
    out.push(`fill="${el.paint.fill}"`);
    if (el.paint.stroke !== "none") {
      out.push(
        `stroke="${el.paint.stroke}"`,
        `stroke-width="${strokeWidth}"`,
        `stroke-linejoin="round"`,
        `stroke-linecap="round"`,
        `vector-effect="non-scaling-stroke"`,
      );
    }
    if (el.attrs["fill-rule"]) out.push(`fill-rule="${el.attrs["fill-rule"]}"`);
    return `<${el.name} ${out.join(" ")}/>`;
  });

  const body = `<g transform="${transform}">${parts.join("")}</g>`;
  const boxes = kept.map((el) => ({
    x1: (el.box.x1 - crop.x) * k,
    y1: (el.box.y1 - crop.y) * k,
    x2: (el.box.x2 - crop.x) * k,
    y2: (el.box.y2 - crop.y) * k,
  }));

  return {
    ok: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>\n`,
    viewBox,
    body,
    box: art,
    elements: kept.length,
    boxes,
    paints: kept.map((el) => el.paint),
    warnings,
  };
}

/** Groups element boxes into clusters that touch. More than one means a floating part. */
export function clusterCount(boxes: Box[], slack = 0.5): number {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (boxesOverlap(boxes[i], boxes[j], slack)) parent[find(i)] = find(j);
    }
  }
  return new Set(boxes.map((_, i) => find(i))).size;
}
