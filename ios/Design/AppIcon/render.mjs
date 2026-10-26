// Renders SVG icon sources to PNG with headless Chrome (Playwright, Chrome channel).
//
//   node render.mjs <in.svg> <out.png> [size=1024] [--alpha]
//   node render.mjs --sheet <sheet.html> <out.png>     (full-page screenshot)
//
// Without --alpha the PNG is flattened; run flatten.swift afterwards to strip the
// alpha channel and tag sRGB (Chrome's PNGs keep an alpha channel even when opaque).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const PLAYWRIGHT =
  process.env.PLAYWRIGHT_PATH ??
  "/Users/lunowe/Library/Caches/pnpm/dlx/6b3cfe2f0081eba8e748c801168f46505dcbe9251901d9b03f3c9b57015d6b06/1a0bad371ac-12cf2/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright";
const { chromium } = require(PLAYWRIGHT);

const args = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
try {
  if (args[0] === "--sheet") {
    const [, html, out] = args;
    const page = await browser.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 1 });
    await page.goto("file://" + resolve(html));
    await page.waitForTimeout(150);
    await page.screenshot({ path: out, fullPage: true });
    console.log("wrote", out);
  } else {
    const alpha = args.includes("--alpha");
    const [svgPath, out, sizeArg] = args.filter((a) => !a.startsWith("--"));
    const size = Number(sizeArg ?? 1024);
    const svg = readFileSync(svgPath, "utf8");
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:${alpha ? "transparent" : "#fff"}}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`,
    );
    await page.screenshot({ path: out, omitBackground: alpha, clip: { x: 0, y: 0, width: size, height: size } });
    console.log("wrote", out);
  }
} finally {
  await browser.close();
}
