import { describe, expect, it } from "vitest";
import { detectImageMime, readImageInfo } from "./image-size";

/**
 * Tiny hand-built headers. Nothing here is a real image: the parsers only ever
 * read the header, so a header plus a few filler bytes is a complete fixture.
 */

function bytes(...parts: (number | number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") for (const ch of part) out.push(ch.charCodeAt(0));
    else if (Array.isArray(part)) out.push(...part);
    else out.push(part);
  }
  return Uint8Array.from(out);
}

const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(width: number, height: number): Uint8Array {
  return bytes(PNG_MAGIC, u32be(13), "IHDR", u32be(width), u32be(height), [8, 6, 0, 0, 0]);
}

function gif(width: number, height: number): Uint8Array {
  return bytes("GIF89a", u16le(width), u16le(height), [0xf7, 0x00, 0x00]);
}

/** A JFIF header, one comment segment to walk over, then the SOF0. */
function jpeg(width: number, height: number): Uint8Array {
  return bytes(
    [0xff, 0xd8],
    [0xff, 0xe0],
    u16be(16),
    "JFIF",
    0x00,
    [1, 1, 0, 0, 1, 0, 1, 0, 0],
    [0xff, 0xfe],
    u16be(4),
    "hi",
    [0xff, 0xc0],
    u16be(17),
    0x08,
    u16be(height),
    u16be(width),
    [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
  );
}

function riff(fourcc: string, payload: number[]): Uint8Array {
  return bytes("RIFF", u32le(payload.length + 12), "WEBP", fourcc, u32le(payload.length), payload);
}

function webpLossy(width: number, height: number): Uint8Array {
  // 3-byte frame tag, sync code, then 14-bit dimensions with 2 scale bits.
  return riff("VP8 ", [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height), 0, 0]);
}

function webpLossless(width: number, height: number): Uint8Array {
  const bits = (width - 1) | ((height - 1) << 14);
  return riff("VP8L", [0x2f, ...u32le(bits >>> 0), 0, 0]);
}

function webpExtended(width: number, height: number): Uint8Array {
  return riff("VP8X", [0x10, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);
}

describe("detectImageMime", () => {
  it("sniffs each accepted format from its magic bytes", () => {
    expect(detectImageMime(png(1, 1))).toBe("image/png");
    expect(detectImageMime(gif(1, 1))).toBe("image/gif");
    expect(detectImageMime(jpeg(1, 1))).toBe("image/jpeg");
    expect(detectImageMime(webpLossy(2, 2))).toBe("image/webp");
  });

  it("refuses anything else, including a lookalike RIFF container", () => {
    expect(detectImageMime(bytes("RIFF", u32le(4), "WAVE", "fmt "))).toBeNull();
    expect(detectImageMime(bytes("<!DOCTYPE html>"))).toBeNull();
    expect(detectImageMime(bytes([0x00]))).toBeNull();
  });
});

describe("readImageInfo", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(readImageInfo(png(1024, 768))).toEqual({ mime: "image/png", width: 1024, height: 768 });
  });

  it("reads GIF dimensions from the screen descriptor", () => {
    expect(readImageInfo(gif(320, 240))).toEqual({ mime: "image/gif", width: 320, height: 240 });
  });

  it("walks JPEG segments to the SOF header", () => {
    expect(readImageInfo(jpeg(800, 1200))).toEqual({ mime: "image/jpeg", width: 800, height: 1200 });
  });

  it("reads all three WebP flavours", () => {
    expect(readImageInfo(webpLossy(640, 480))).toEqual({
      mime: "image/webp",
      width: 640,
      height: 480,
    });
    expect(readImageInfo(webpLossless(300, 200))).toEqual({
      mime: "image/webp",
      width: 300,
      height: 200,
    });
    expect(readImageInfo(webpExtended(1500, 2000))).toEqual({
      mime: "image/webp",
      width: 1500,
      height: 2000,
    });
  });

  it("returns null for a truncated header rather than guessing", () => {
    expect(readImageInfo(png(10, 10).slice(0, 18))).toBeNull();
    expect(readImageInfo(bytes([0xff, 0xd8, 0xff]))).toBeNull();
  });

  it("returns null for a zero-sized image", () => {
    expect(readImageInfo(png(0, 10))).toBeNull();
  });
});
