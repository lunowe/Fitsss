/**
 * Minimal image header parsers.
 *
 * Inspiration pictures are stored exactly as they arrive — the UI resizes
 * before upload and URL imports are size-capped — so all we need from the
 * bytes is the format and the pixel dimensions. Doing that with four small
 * header readers keeps a native dependency (sharp, image-size) out of the
 * tree, which matters because this runs inside a server action.
 *
 * Pure: takes bytes, returns numbers. No IO.
 */

export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];

export function isImageMime(value: string): value is ImageMime {
  return (IMAGE_MIMES as readonly string[]).includes(value);
}

export interface ImageInfo {
  mime: ImageMime;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/* Byte helpers                                                        */
/* ------------------------------------------------------------------ */

function u16be(b: Uint8Array, at: number): number {
  return (b[at] << 8) | b[at + 1];
}

function u16le(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8);
}

function u24le(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
}

function u32be(b: Uint8Array, at: number): number {
  return ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
}

function u32le(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

function ascii(b: Uint8Array, at: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(b[at + i]);
  return out;
}

function startsWith(b: Uint8Array, bytes: readonly number[]): boolean {
  if (b.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (b[i] !== bytes[i]) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Format detection                                                    */
/* ------------------------------------------------------------------ */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Sniffs the format from the magic bytes. Never trusts a Content-Type header. */
export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, PNG_MAGIC)) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
    return "image/gif";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Per-format dimensions                                               */
/* ------------------------------------------------------------------ */

/** PNG: the IHDR chunk is always the first chunk, at a fixed offset. */
function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null;
  if (ascii(b, 12, 4) !== "IHDR") return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** GIF: the logical screen descriptor follows the six-byte signature. */
function gifSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 10) return null;
  return { width: u16le(b, 6), height: u16le(b, 8) };
}

/** Markers that carry a start-of-frame header (and so the real dimensions). */
function isSofMarker(marker: number): boolean {
  if (marker < 0xc0 || marker > 0xcf) return false;
  // C4 = huffman tables, C8 = JPG extension, CC = arithmetic coding conditioning.
  return marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/** JPEG: walk the segment chain until a SOFn header shows up. */
function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let at = 2; // past SOI
  while (at + 3 < b.length) {
    if (b[at] !== 0xff) {
      at += 1; // resynchronise on padding garbage
      continue;
    }
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      at += 2;
      continue;
    }
    const length = u16be(b, at + 2);
    if (length < 2) return null;
    if (isSofMarker(marker)) {
      if (at + 9 > b.length) return null;
      return { height: u16be(b, at + 5), width: u16be(b, at + 7) };
    }
    at += 2 + length;
  }
  return null;
}

/**
 * WebP: three container flavours. VP8 is lossy, VP8L lossless, VP8X the
 * extended header used for animation and alpha.
 */
function webpSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 16) return null;
  const fourcc = ascii(b, 12, 4);

  if (fourcc === "VP8 ") {
    if (b.length < 30) return null;
    // 3-byte frame tag, then the sync code 9d 01 2a, then 14-bit dimensions.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }

  if (fourcc === "VP8L") {
    if (b.length < 25) return null;
    if (b[20] !== 0x2f) return null;
    const bits = u32le(b, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (fourcc === "VP8X") {
    if (b.length < 30) return null;
    // 1 byte flags + 3 reserved, then canvas width-1 and height-1, 24-bit LE.
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Format plus pixel dimensions, or null when the bytes are not one of the
 * four formats we accept or the header is truncated or nonsensical.
 */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const mime = detectImageMime(bytes);
  if (!mime) return null;

  const size =
    mime === "image/png"
      ? pngSize(bytes)
      : mime === "image/gif"
        ? gifSize(bytes)
        : mime === "image/jpeg"
          ? jpegSize(bytes)
          : webpSize(bytes);

  if (!size) return null;
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) return null;
  if (size.width <= 0 || size.height <= 0) return null;
  if (size.width > 65535 || size.height > 65535) return null;
  return { mime, width: size.width, height: size.height };
}
