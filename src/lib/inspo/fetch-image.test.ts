import { describe, expect, it } from "vitest";
import { checkUrl, extractImageUrl, isBlockedAddress } from "./fetch-image";

/**
 * The guards, tested without touching the network. `resolveImageUrl` itself is
 * exercised end to end by scripts/try-inspo.ts; what matters here is that the
 * checks it composes refuse the right things.
 */

describe("isBlockedAddress", () => {
  it("blocks loopback, private and link-local IPv4", () => {
    for (const address of [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.1",
      "169.254.169.254", // the cloud metadata endpoint
      "0.0.0.0",
      "100.64.0.1", // carrier-grade NAT
      "192.0.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it("allows ordinary public IPv4", () => {
    for (const address of ["1.1.1.1", "8.8.8.8", "151.101.1.140", "172.32.0.1", "192.167.1.1"]) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });

  it("blocks loopback, unique-local and link-local IPv6", () => {
    for (const address of ["::1", "::", "fe80::1", "fe80::1%en0", "fd00::1", "fc00::abcd", "ff02::1"]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it("sees through IPv4-mapped IPv6", () => {
    expect(isBlockedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("allows public IPv6", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks anything it cannot parse", () => {
    expect(isBlockedAddress("")).toBe(true);
    expect(isBlockedAddress("not-an-address")).toBe(true);
  });
});

describe("checkUrl", () => {
  it("accepts plain http and https", () => {
    const result = checkUrl(" https://pinterest.com/pin/123 ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.hostname).toBe("pinterest.com");
  });

  it("refuses non-http schemes", () => {
    for (const raw of [
      "file:///etc/passwd",
      "ftp://example.com/a.jpg",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
    ]) {
      expect(checkUrl(raw).ok, raw).toBe(false);
    }
  });

  it("refuses credentials in the URL", () => {
    expect(checkUrl("https://user:pass@example.com/a.jpg").ok).toBe(false);
    expect(checkUrl("https://user@example.com/a.jpg").ok).toBe(false);
  });

  it("refuses empty and malformed input", () => {
    expect(checkUrl("").ok).toBe(false);
    expect(checkUrl("   ").ok).toBe(false);
    expect(checkUrl("just some text").ok).toBe(false);
    expect(checkUrl(`https://example.com/${"a".repeat(4000)}`).ok).toBe(false);
  });
});

describe("extractImageUrl", () => {
  const base = "https://www.pinterest.com/pin/12345/";

  it("finds og:image on a pin page", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="A look">
        <meta property="og:image" content="https://i.pinimg.com/originals/ab/cd.jpg">
      </head><body></body></html>`;
    expect(extractImageUrl(html, base)).toBe("https://i.pinimg.com/originals/ab/cd.jpg");
  });

  it("prefers og:image:secure_url over og:image", () => {
    const html = `
      <meta property="og:image" content="http://cdn.example.com/a.jpg">
      <meta property="og:image:secure_url" content="https://cdn.example.com/a.jpg">`;
    expect(extractImageUrl(html, base)).toBe("https://cdn.example.com/a.jpg");
  });

  it("falls back to twitter:image", () => {
    const html = `<meta name="twitter:image" content="https://cdn.example.com/t.png">`;
    expect(extractImageUrl(html, base)).toBe("https://cdn.example.com/t.png");
  });

  it("resolves relative URLs and decodes entities", () => {
    const html = `<meta property="og:image" content="/media/a.jpg?w=800&amp;h=600">`;
    expect(extractImageUrl(html, base)).toBe("https://www.pinterest.com/media/a.jpg?w=800&h=600");
  });

  it("handles single quotes and unquoted attributes", () => {
    expect(extractImageUrl(`<meta property='og:image' content='/a.jpg'>`, base)).toBe(
      "https://www.pinterest.com/a.jpg",
    );
    expect(extractImageUrl(`<meta property=og:image content=/b.jpg>`, base)).toBe(
      "https://www.pinterest.com/b.jpg",
    );
  });

  it("falls back to a large img when there is no meta tag", () => {
    const html = `
      <img src="/icons/logo.png" width="24" height="24">
      <img src="/photos/look.jpg" width="900" height="1200">`;
    expect(extractImageUrl(html, base)).toBe("https://www.pinterest.com/photos/look.jpg");
  });

  it("reads the first candidate out of a srcset", () => {
    const html = `<img srcset="/small.jpg 400w, /large.jpg 1200w">`;
    expect(extractImageUrl(html, base)).toBe("https://www.pinterest.com/small.jpg");
  });

  it("ignores data URLs and unusable schemes", () => {
    const html = `<meta property="og:image" content="data:image/png;base64,AAAA">
      <img src="data:image/gif;base64,R0lGOD">`;
    expect(extractImageUrl(html, base)).toBeNull();
  });

  it("returns null for a page with no picture", () => {
    expect(extractImageUrl("<html><body><p>nothing here</p></body></html>", base)).toBeNull();
  });
});
