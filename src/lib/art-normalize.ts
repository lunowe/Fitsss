/**
 * Turns an arbitrary uploaded SVG into the shape `Silhouette` can tint.
 *
 * The built-in drawings follow one convention: flat shapes whose fill is
 * `var(--icon-fill, …)`, a second colour on `var(--icon-fill-2, …)` for
 * collars and soles, and outlines on `var(--icon-stroke, …)`. An uploaded file
 * knows nothing about that, so we rewrite it: the colour it uses most becomes
 * the garment colour, other colours become the second colour, and strokes
 * become the ink. Everything that could execute, phone home or depend on an
 * id we dropped is removed rather than sanitised — the markup is inlined with
 * `dangerouslySetInnerHTML`, so an allow-list is the only safe posture.
 *
 * Pure string work: no DOM, so it runs in a server action and in a unit test.
 */

export interface NormalizedArt {
  viewBox: string;
  body: string;
}

export type ArtNormalizeResult =
  | { ok: true; value: NormalizedArt }
  | { ok: false; errors: string[] };

/** Roughly 200 KB. Real garment drawings land well under 40 KB. */
export const MAX_SVG_CHARS = 200_000;

/** Shapes we keep. Everything else is markup we cannot safely inline. */
const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
]);

/**
 * Elements removed together with their content: they either execute, load
 * something, or only exist to be referenced by an id we are about to drop.
 */
const DROPPED_SUBTREES = [
  "script",
  "style",
  "defs",
  "mask",
  "clipPath",
  "pattern",
  "marker",
  "filter",
  "symbol",
  "linearGradient",
  "radialGradient",
  "foreignObject",
  "metadata",
  "title",
  "desc",
  "image",
  "use",
  "a",
  "text",
  "tspan",
  "switch",
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
  "view",
];

/** Attributes we keep. Geometry and paint only: no ids, classes or handlers. */
const ALLOWED_ATTRS: ReadonlySet<string> = new Set([
  "d",
  "points",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "transform",
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "vector-effect",
  "clip-rule",
  "paint-order",
]);

const BLACK_FILLS: ReadonlySet<string> = new Set([
  "#000",
  "#000000",
  "black",
  "rgb(0,0,0)",
  "rgb(0 0 0)",
  "currentcolor",
]);

const FILL_VAR = "var(--icon-fill, #b3b3b3)";
const STROKE_VAR = "var(--icon-stroke, #000)";

const TAG_RE = /<\/?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const ATTR_RE = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

type Attrs = [string, string][];

function parseAttrs(raw: string): Attrs {
  const out: Attrs = [];
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    out.push([match[1].toLowerCase(), (match[2] ?? match[3] ?? "").trim()]);
  }
  return out;
}

function serializeAttrs(attrs: Attrs): string {
  return attrs.map(([name, value]) => ` ${name}="${value.replace(/"/g, "&quot;")}"`).join("");
}

/** `style="fill:#333;stroke-width:2"` folded into real attributes. */
function inlineStyleAttrs(style: string): Attrs {
  const out: Attrs = [];
  for (const declaration of style.split(";")) {
    const [rawName, ...rest] = declaration.split(":");
    const name = rawName?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (name && value && ALLOWED_ATTRS.has(name)) out.push([name, value]);
  }
  return out;
}

/** External or scripted references never survive normalization. */
function isUnsafeValue(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("javascript:") ||
    lower.includes("url(") ||
    lower.includes("http://") ||
    lower.includes("https://") ||
    lower.includes("data:")
  );
}

/** Values we wrote ourselves are already in the convention; leave them alone. */
function isNormalizedPaint(value: string): boolean {
  return value.toLowerCase().startsWith("var(--icon-");
}

function removeDroppedSubtrees(body: string): string {
  let out = body.replace(/<!--[\s\S]*?-->/g, "");
  for (const name of DROPPED_SUBTREES) {
    const paired = new RegExp(`<\\s*${name}\\b[^>]*>[\\s\\S]*?<\\s*/\\s*${name}\\s*>`, "gi");
    const selfClosing = new RegExp(`<\\s*${name}\\b[^>]*/>`, "gi");
    const orphan = new RegExp(`<\\s*/?\\s*${name}\\b[^>]*>`, "gi");
    out = out.replace(paired, "").replace(selfClosing, "").replace(orphan, "");
  }
  return out;
}

/** Rewrites every kept tag through `fn`; drops tags we do not allow. */
function mapTags(body: string, fn: (name: string, attrs: Attrs) => Attrs): string {
  TAG_RE.lastIndex = 0;
  return body.replace(TAG_RE, (whole, rawName: string, rawAttrs: string, selfClose: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(name)) return "";
    if (whole.startsWith("</")) return `</${name}>`;
    return `<${name}${serializeAttrs(fn(name, parseAttrs(rawAttrs)))}${selfClose ? "/" : ""}>`;
  });
}

/** Keeps geometry and paint, folds `style` in, drops anything external. */
function cleanAttrs(attrs: Attrs): Attrs {
  const out: Attrs = [];
  for (const [name, value] of attrs) {
    if (name === "style") {
      for (const pair of inlineStyleAttrs(value)) {
        if (!isUnsafeValue(pair[1])) out.push(pair);
      }
      continue;
    }
    if (!ALLOWED_ATTRS.has(name)) continue;
    if (isUnsafeValue(value)) continue;
    out.push([name, value]);
  }
  // A folded style declaration wins over the presentation attribute it shadows.
  const seen = new Map<string, string>();
  for (const [name, value] of out) seen.set(name, value);
  return [...seen];
}

/** Extracts `viewBox`, falling back to `width`/`height` on the root element. */
function viewBoxOf(attrs: Attrs): string | null {
  const map = new Map(attrs);
  const viewBox = map.get("viewbox")?.trim();
  if (viewBox) {
    const numbers = viewBox.split(/[\s,]+/).map(Number);
    if (numbers.length === 4 && numbers.every((n) => Number.isFinite(n)) && numbers[2] > 0 && numbers[3] > 0) {
      return numbers.join(" ");
    }
    return null;
  }
  const width = parseFloat(map.get("width") ?? "");
  const height = parseFloat(map.get("height") ?? "");
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return `0 0 ${width} ${height}`;
  }
  return null;
}

/**
 * Normalizes an uploaded SVG into `{ viewBox, body }` ready for `Silhouette`.
 * Idempotent: running it over one of the built-in drawings returns it unchanged.
 */
export function normalizeSvgArt(raw: unknown): ArtNormalizeResult {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, errors: ["Pick an SVG file"] };
  if (raw.length > MAX_SVG_CHARS) {
    return { ok: false, errors: [`That file is too big — keep artwork under ${MAX_SVG_CHARS / 1000} KB`] };
  }

  const source = raw.replace(/<\?xml[\s\S]*?\?>/gi, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  const open = /<svg\b((?:"[^"]*"|'[^']*'|[^>"'])*?)>/i.exec(source);
  if (!open) return { ok: false, errors: ["That does not look like an SVG file"] };

  const viewBox = viewBoxOf(parseAttrs(open[1]));
  if (!viewBox) return { ok: false, errors: ["The SVG needs a viewBox or a width and height"] };

  const close = source.lastIndexOf("</svg");
  const inner = source.slice(open.index + open[0].length, close === -1 ? undefined : close);

  const stripped = removeDroppedSubtrees(inner);

  // First pass: what colour does this drawing mostly use? That is the garment.
  const fillCounts = new Map<string, number>();
  mapTags(stripped, (_name, attrs) => {
    for (const [name, value] of cleanAttrs(attrs)) {
      if (name !== "fill") continue;
      const fill = value.toLowerCase();
      if (fill === "none" || isNormalizedPaint(fill)) continue;
      fillCounts.set(fill, (fillCounts.get(fill) ?? 0) + 1);
    }
    return attrs;
  });

  let primary: string | null = null;
  let best = 0;
  for (const [fill, count] of fillCounts) {
    if (count > best) {
      best = count;
      primary = fill;
    }
  }

  // Second pass: rewrite paint into the tinting convention.
  const body = mapTags(stripped, (_name, attrs) =>
    cleanAttrs(attrs).map(([name, value]) => {
      if (name === "fill") {
        const fill = value.toLowerCase();
        if (fill === "none" || isNormalizedPaint(value)) return [name, value];
        if (fill === primary) return [name, FILL_VAR];
        if (BLACK_FILLS.has(fill)) return [name, value];
        return [name, `var(--icon-fill-2, ${value})`];
      }
      if (name === "stroke") {
        const stroke = value.toLowerCase();
        if (stroke === "none" || isNormalizedPaint(value)) return [name, value];
        return [name, STROKE_VAR];
      }
      return [name, value];
    }),
  )
    .replace(/>\s+</g, "><")
    .trim();

  if (!/<(path|circle|ellipse|rect|line|polyline|polygon)\b/i.test(body)) {
    return { ok: false, errors: ["That SVG has no shapes we can draw"] };
  }

  return { ok: true, value: { viewBox, body } };
}
