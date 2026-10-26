import { lookup } from "node:dns/promises";

import { looksComplete, readImageInfo, type ImageMime } from "./image-size";

/**
 * Pulling a picture off the internet on the user's behalf.
 *
 * Everything here is hostile-input handling: the URL comes from a share sheet
 * or a paste box, so it can point at the loopback interface, at the cloud
 * metadata endpoint, at a 4 GB file, or at an HTML page that redirects to any
 * of those. The guards below are the whole point of the module; the happy
 * path (Pinterest pin page → og:image → JPEG bytes) is three lines.
 *
 * No resizing happens here. The bytes are stored as received: the UI resizes
 * before upload, and a URL import that is too big is refused rather than
 * silently degraded, because we have no native image encoder.
 */

export const USER_AGENT = "Mozilla/5.0 (compatible; Fitsss/0.1)";
export const FETCH_TIMEOUT_MS = 6_000;
export const MAX_REDIRECTS = 3;
/** Hard ceiling on any downloaded image. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** URL imports we accept without a client-side resize step. */
export const MAX_URL_IMAGE_BYTES = Math.round(2.5 * 1024 * 1024);
/** We only ever read the head of a page looking for a meta tag. */
export const MAX_HTML_BYTES = 2 * 1024 * 1024;

export type FetchImageCode = "invalid" | "fetch" | "too-large";

export interface FetchedImage {
  bytes: Buffer;
  mime: ImageMime;
  width: number;
  height: number;
  /** The URL the bytes actually came from, after og:image and redirects. */
  imageUrl: string;
}

export type ResolveImageResult =
  | { ok: true; image: FetchedImage }
  | { ok: false; code: FetchImageCode; error: string };

/* ------------------------------------------------------------------ */
/* SSRF guards                                                         */
/* ------------------------------------------------------------------ */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Octets(value: string): number[] | null {
  const m = IPV4_RE.exec(value);
  if (!m) return null;
  const octets = m.slice(1, 5).map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // 192.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/**
 * An IPv6 address as eight 16-bit groups, or null when it is not one. Reads
 * every spelling the URL parser and the resolver produce: "::" runs, a
 * dotted IPv4 tail ("::ffff:127.0.0.1") and its hex twin ("::ffff:7f00:1").
 */
function ipv6Groups(value: string): number[] | null {
  let head = value;
  const embedded: number[] = [];
  const tailStart = head.lastIndexOf(":") + 1;
  const tail = head.slice(tailStart);
  if (tail.includes(".")) {
    const v4 = ipv4Octets(tail);
    if (!v4) return null;
    embedded.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
    head = head.slice(0, tailStart);
    if (head.endsWith(":") && !head.endsWith("::")) head = head.slice(0, -1);
  }

  const halves = head.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  const numbers = (parts: string[]) => parts.map((part) => (/^[0-9a-f]{1,4}$/.test(part) ? parseInt(part, 16) : NaN));
  const left = numbers(groups(halves[0]));
  const right = halves.length === 2 ? numbers(groups(halves[1])) : [];
  if ([...left, ...right].some(Number.isNaN)) return null;

  const count = left.length + right.length + embedded.length;
  if (halves.length === 2) {
    // "::" stands for at least one group of zeros.
    if (count > 7) return null;
    return [...left, ...new Array<number>(8 - count).fill(0), ...right, ...embedded];
  }
  return count === 8 ? [...left, ...embedded] : null;
}

/** The IPv4 address in two 16-bit groups. */
function v4From(high: number, low: number): number[] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

/**
 * True for any address we refuse to talk to: loopback, private, link-local,
 * carrier-grade NAT, multicast and reserved space, in both IP families, and
 * every IPv6 form that carries an IPv4 address inside it (mapped,
 * compatible, translated, NAT64, 6to4), judged by that IPv4 address.
 */
export function isBlockedAddress(address: string): boolean {
  const raw = address.trim().toLowerCase();
  if (!raw) return true;

  const v4 = ipv4Octets(raw);
  if (v4) return isPrivateIpv4(v4);

  // Strip a zone index ("fe80::1%en0") before parsing.
  const g = ipv6Groups(raw.split("%")[0]);
  if (!g) return true; // not an address we understand

  const zero = (from: number, to: number) => g.slice(from, to).every((group) => group === 0);
  // ::a.b.c.d (compatible, incl. :: and ::1), ::ffff:a.b.c.d (mapped),
  // ::ffff:0:a.b.c.d (translated), 64:ff9b::a.b.c.d (NAT64).
  if (zero(0, 6)) return isPrivateIpv4(v4From(g[6], g[7]));
  if (zero(0, 5) && g[5] === 0xffff) return isPrivateIpv4(v4From(g[6], g[7]));
  if (zero(0, 4) && g[4] === 0xffff && g[5] === 0) return isPrivateIpv4(v4From(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return isPrivateIpv4(v4From(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // 64:ff9b:1::/48 local NAT64
  if (g[0] === 0x2002) return isPrivateIpv4(v4From(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo: hides an IPv4 address
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if (g[0] === 0x100 && zero(1, 4)) return true; // 100::/64 discard
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 old site-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

/** Syntactic checks only: scheme, credentials, shape. No DNS. */
export function checkUrl(raw: string): UrlCheck {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return { ok: false, error: "That link is empty." };
  if (trimmed.length > 2048) return { ok: false, error: "That link is too long." };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "That does not look like a link." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http and https links work here." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Links with a username or password in them are not allowed." };
  }
  if (!url.hostname) return { ok: false, error: "That link has no host." };
  return { ok: true, url };
}

/** Resolves the host and refuses anything that lands inside the network. */
async function checkHostIsPublic(hostname: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const bare = hostname.replace(/^\[|\]$/g, "");

  // A literal IP never reaches the resolver, so check it directly.
  if (ipv4Octets(bare) || bare.includes(":")) {
    return isBlockedAddress(bare)
      ? { ok: false, error: "That link points inside a private network." }
      : { ok: true };
  }
  if (bare === "localhost" || bare.endsWith(".localhost") || bare.endsWith(".local")) {
    return { ok: false, error: "That link points inside a private network." };
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(bare, { all: true });
  } catch {
    return { ok: false, error: "That host could not be found." };
  }
  if (addresses.length === 0) return { ok: false, error: "That host could not be found." };
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      return { ok: false, error: "That link points inside a private network." };
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Guarded fetch                                                       */
/* ------------------------------------------------------------------ */

export interface GuardedResponse {
  url: string;
  status: number;
  contentType: string;
  body: ReadableStream<Uint8Array> | null;
}

/**
 * `fetch` with redirects followed by hand so every hop is re-checked. Returns
 * the response without reading the body, so the caller can cap the size.
 */
export async function guardedFetch(
  raw: string,
  accept: string,
): Promise<{ ok: true; response: GuardedResponse } | { ok: false; code: FetchImageCode; error: string }> {
  let current = raw;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = checkUrl(current);
    if (!checked.ok) return { ok: false, code: "invalid", error: checked.error };

    const host = await checkHostIsPublic(checked.url.hostname);
    if (!host.ok) return { ok: false, code: "invalid", error: host.error };

    let response: Response;
    try {
      response = await fetch(checked.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT, accept },
      });
    } catch {
      return { ok: false, code: "fetch", error: "That link could not be loaded." };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) return { ok: false, code: "fetch", error: "That link redirects nowhere." };
      if (hop === MAX_REDIRECTS) {
        return { ok: false, code: "fetch", error: "That link redirects too many times." };
      }
      current = new URL(location, checked.url).toString();
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, code: "fetch", error: `That link returned ${response.status}.` };
    }

    return {
      ok: true,
      response: {
        url: checked.url.toString(),
        status: response.status,
        contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
        body: response.body,
      },
    };
  }

  return { ok: false, code: "fetch", error: "That link redirects too many times." };
}

/**
 * Reads at most `limit` bytes. Past that, an image is an error (`overflow`),
 * while a page is cut there (`truncate`): only its head is wanted, for the
 * og:image, and a long page's head is as good as a short one's.
 */
async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  options: { truncate?: boolean } = {},
): Promise<{ ok: true; bytes: Buffer } | { ok: false; overflow: boolean }> {
  if (!body) return { ok: false, overflow: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (total + value.byteLength > limit) {
        await reader.cancel().catch(() => {});
        if (!options.truncate) return { ok: false, overflow: true };
        chunks.push(value.subarray(0, limit - total));
        total = limit;
        break;
      }
      total += value.byteLength;
      chunks.push(value);
    }
  } catch {
    return { ok: false, overflow: false };
  }
  return { ok: true, bytes: Buffer.concat(chunks, total) };
}

/* ------------------------------------------------------------------ */
/* og:image extraction                                                 */
/* ------------------------------------------------------------------ */

const META_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /([a-z0-9:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const IMG_RE = /<img\b[^>]*>/gi;

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(tag)) !== null) {
    out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
  }
  return out;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

/** Meta names we trust, best first. Pinterest pin pages expose og:image. */
const META_KEYS = ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"];

/**
 * Finds the picture a page is about: the Open Graph image if it declares one,
 * otherwise the first `<img>` big enough to be content rather than chrome.
 * Deliberately regex-based — we do not want an HTML parser in the bundle for
 * four meta tags, and a malformed page should return null, not throw.
 */
export function extractImageUrl(html: string, baseUrl: string): string | null {
  const head = html.slice(0, MAX_HTML_BYTES);

  const metas: Record<string, string> = {};
  META_RE.lastIndex = 0;
  let tag: RegExpExecArray | null;
  while ((tag = META_RE.exec(head)) !== null) {
    const attrs = attributes(tag[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    const value = attrs.content ?? attrs.value ?? "";
    if (key && value && !metas[key]) metas[key] = value;
  }

  for (const key of META_KEYS) {
    const found = absolute(metas[key], baseUrl);
    if (found) return found;
  }

  IMG_RE.lastIndex = 0;
  let best: { url: string; area: number } | null = null;
  while ((tag = IMG_RE.exec(head)) !== null) {
    const attrs = attributes(tag[0]);
    const src = attrs.src || attrs["data-src"] || firstFromSrcset(attrs.srcset);
    const url = absolute(src, baseUrl);
    if (!url) continue;
    const width = Number(attrs.width) || 0;
    const height = Number(attrs.height) || 0;
    const area = width * height;
    // Unsized images are plausible content; sized ones must be reasonably big.
    if (area > 0 && (width < 200 || height < 200)) continue;
    if (!best || area > best.area) best = { url, area };
    if (best.area === 0 && area === 0) break; // first unsized image wins
  }
  return best?.url ?? null;
}

function firstFromSrcset(srcset: string | undefined): string {
  if (!srcset) return "";
  const first = srcset.split(",")[0]?.trim() ?? "";
  return first.split(/\s+/)[0] ?? "";
}

function absolute(value: string | undefined, baseUrl: string): string | null {
  const raw = value?.trim();
  if (!raw || raw.startsWith("data:")) return null;
  try {
    const url = new URL(raw, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* resolveImageUrl                                                     */
/* ------------------------------------------------------------------ */

const TOO_LARGE_HINT =
  "That picture is too big to import from a link. Take a screenshot and upload it instead.";

function toImage(bytes: Buffer, imageUrl: string): ResolveImageResult {
  const info = readImageInfo(bytes);
  if (!info) {
    return { ok: false, code: "invalid", error: "That file is not a JPEG, PNG, WebP or GIF." };
  }
  if (!looksComplete(bytes, info.mime)) {
    return { ok: false, code: "invalid", error: "That picture is cut off or damaged." };
  }
  return { ok: true, image: { bytes, mime: info.mime, width: info.width, height: info.height, imageUrl } };
}

async function downloadImage(url: string, limit: number): Promise<ResolveImageResult> {
  const fetched = await guardedFetch(url, "image/jpeg,image/png,image/webp,image/gif;q=0.9,*/*;q=0.1");
  if (!fetched.ok) return fetched;

  const type = fetched.response.contentType.split(";")[0].trim();
  if (type && !type.startsWith("image/")) {
    await fetched.response.body?.cancel();
    return { ok: false, code: "invalid", error: "That link is not a picture." };
  }

  const read = await readCapped(fetched.response.body, Math.min(limit, MAX_IMAGE_BYTES));
  if (!read.ok) {
    return read.overflow
      ? { ok: false, code: "too-large", error: TOO_LARGE_HINT }
      : { ok: false, code: "fetch", error: "That picture could not be downloaded." };
  }
  return toImage(read.bytes, fetched.response.url);
}

/**
 * Takes whatever the user shared — a direct image link or a page about a
 * picture — and comes back with the bytes.
 *
 * A direct image is downloaded straight away. A page is read (head only),
 * its og:image is resolved against the page URL, and that is downloaded as a
 * second, separately guarded request.
 */
export async function resolveImageUrl(pageUrl: string): Promise<ResolveImageResult> {
  const checked = checkUrl(pageUrl);
  if (!checked.ok) return { ok: false, code: "invalid", error: checked.error };

  const fetched = await guardedFetch(checked.url.toString(), "text/html,image/*;q=0.9,*/*;q=0.1");
  if (!fetched.ok) return fetched;

  const type = fetched.response.contentType.split(";")[0].trim();

  if (type.startsWith("image/")) {
    const read = await readCapped(fetched.response.body, MAX_URL_IMAGE_BYTES);
    if (!read.ok) {
      return read.overflow
        ? { ok: false, code: "too-large", error: TOO_LARGE_HINT }
        : { ok: false, code: "fetch", error: "That picture could not be downloaded." };
    }
    return toImage(read.bytes, fetched.response.url);
  }

  const html = await readCapped(fetched.response.body, MAX_HTML_BYTES, { truncate: true });
  if (!html.ok) {
    return { ok: false, code: "fetch", error: "That page could not be read." };
  }

  const imageUrl = extractImageUrl(html.bytes.toString("utf8"), fetched.response.url);
  if (!imageUrl) {
    return {
      ok: false,
      code: "fetch",
      error: "No picture was found on that page. Save the image and upload it instead.",
    };
  }

  return downloadImage(imageUrl, MAX_URL_IMAGE_BYTES);
}
