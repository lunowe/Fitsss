/**
 * Removes control characters from user text, keeping line breaks and tabs,
 * and replaces lone surrogates with U+FFFD.
 * Postgres cannot store NUL in a text column at all (the write fails with
 * 22021), and the rest are never meant to be there.
 */
export function cleanText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // Half of a surrogate pair is not text: Postgres refuses it in JSON
    // columns (a 500) and turns it into U+FFFD in text ones. Do the latter
    // everywhere, before it gets that far.
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}

/** Characters long, the way `clipText` cuts: code points, not UTF-16 units. */
export function textLength(text: string): number {
  return Array.from(text).length;
}

/**
 * True when the text has something to see: not only whitespace and
 * zero-width characters (a name of nothing but U+200B shows as a blank row
 * and is read as nothing by VoiceOver).
 */
export function hasVisibleText(text: string): boolean {
  return text.replace(INVISIBLE, "").length > 0;
}

/**
 * Characters that render as nothing: whitespace, zero-width and joiner
 * characters, direction marks and isolates, the soft hyphen, the combining
 * grapheme joiner, Hangul fillers, the blank Braille pattern, variation
 * selectors and tag characters.
 */
const INVISIBLE =
  /[\s\u00AD\u034F\u115F\u1160\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u2800\u3164\uFE00-\uFE0F\uFEFF\u{E0000}-\u{E007F}]/gu;

/**
 * Cleans user text (see `cleanText`) and cuts it to at most `max`
 * characters without splitting one.
 *
 * `String.prototype.slice` counts UTF-16 units, so cutting "…👕" at the
 * limit can keep half of a surrogate pair, which Postgres then rejects (or
 * stores as a replacement character). This counts code points instead.
 */
export function clipText(text: string, max: number): string {
  const clean = cleanText(text);
  if (clean.length <= max) return clean;
  // Whole characters as people see them (a flag, a family emoji, an
  // accented letter made of two code points), within `max` code points.
  let out = "";
  let used = 0;
  for (const { segment } of graphemes.segment(clean)) {
    const size = Array.from(segment).length;
    if (used + size > max) break;
    out += segment;
    used += size;
  }
  return out;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
