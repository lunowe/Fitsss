// Builds the three AppIcon PNGs from icon.svg and verifies them.
//
//   node ios/Design/AppIcon/build.mjs            writes into Assets.xcassets/AppIcon.appiconset
//   node ios/Design/AppIcon/build.mjs <outdir>   writes somewhere else (previews)
//
// Needs Chrome (via Playwright, see render.mjs) and swift (flatten.swift).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? join(here, "../../Fitsss/Assets.xcassets/AppIcon.appiconset"));
const source = readFileSync(join(here, "icon.svg"), "utf8");

// Light colours in icon.svg → per-appearance colours. The light icon uses the app's
// --color-card / --color-ink tokens; dark uses the dark-mode values of the same tokens
// (card #1c1c1e rather than #000: Apple asks not to use black behind a dark icon).
// Tinted is a white glyph on transparency: iOS draws its own background and tints
// the glyph by luminance.
const VARIANTS = [
  { file: "AppIcon-1024.png", bg: "#ffffff", mark: "#000000", alpha: false },
  { file: "AppIcon-1024-dark.png", bg: "#1c1c1e", mark: "#ffffff", alpha: false },
  { file: "AppIcon-1024-tinted.png", bg: "none", mark: "#ffffff", alpha: true },
];

mkdirSync(outDir, { recursive: true });
mkdirSync("/tmp/fitsss-icon", { recursive: true });

for (const v of VARIANTS) {
  const svg = source
    .replace(/#ffffff/g, "__BG__")
    .replace(/#000000/g, "__MARK__")
    .replace(/__BG__/g, v.bg)
    .replace(/__MARK__/g, v.mark);
  const svgPath = `/tmp/fitsss-icon/${v.file}.svg`;
  const rawPath = `/tmp/fitsss-icon/${v.file}.raw.png`;
  writeFileSync(svgPath, svg);
  execFileSync("node", [join(here, "render.mjs"), svgPath, rawPath, "1024", ...(v.alpha ? ["--alpha"] : [])], { stdio: "inherit" });
  execFileSync("swift", [join(here, "flatten.swift"), rawPath, join(outDir, v.file), ...(v.alpha ? ["--keep-alpha"] : [])], { stdio: "inherit" });
}

const report = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", "-g", "hasAlpha", "-g", "space", ...VARIANTS.map((v) => join(outDir, v.file))]).toString();
console.log(report);
for (const v of VARIANTS) {
  const block = report.slice(report.indexOf(v.file));
  const ok = /pixelWidth: 1024/.test(block) && /pixelHeight: 1024/.test(block) && new RegExp(`hasAlpha: ${v.alpha ? "yes" : "no"}`).test(block);
  if (!ok) {
    console.error(`verification failed for ${v.file}`);
    process.exit(1);
  }
}
console.log("ok:", VARIANTS.map((v) => v.file).join(", "));
