// Builds a contact-sheet HTML for a set of icon PNGs: each icon at 256 (1024 scaled), 180,
// 120 and 58 px on a light and a dark wallpaper, with the iOS home-screen mask applied.
//   node sheet.mjs <out.html> <title> name=light.png[,dark.png[,tinted.png]] ...
import { writeFileSync } from "node:fs";

const [out, title, ...specs] = process.argv.slice(2);
const items = specs.map((s) => {
  const [name, files] = s.split("=");
  const [light, dark, tinted] = files.split(",");
  return { name, light, dark: dark ?? light, tinted };
});

const sizes = [1024, 180, 120, 58];
const icon = (src, size, label) =>
  `<figure class="ic" style="--s:${size}px"><img src="${src}"><figcaption>${label ?? size}</figcaption></figure>`;

const row = (it) => `
<section class="row">
  <h2>${it.name}</h2>
  <div class="wall light">${sizes.map((s) => icon(it.light, s)).join("")}</div>
  <div class="wall dark">${sizes.map((s) => icon(it.dark, s)).join("")}</div>
  ${it.tinted ? `<div class="wall tinted">${sizes.map((s) => `<figure class="ic tint" style="--s:${s}px"><div class="tintbg"><img src="${it.tinted}"></div><figcaption>${s}</figcaption></figure>`).join("")}</div>` : ""}
</section>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{margin:0;background:#e5e5ea;font:13px -apple-system,Helvetica,Arial,sans-serif;color:#333;padding:24px}
  h1{font-size:18px;margin:0 0 16px}
  h2{font-size:13px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#555}
  .row{margin-bottom:28px}
  .wall{display:flex;gap:40px;align-items:flex-end;padding:28px 32px;border-radius:14px;margin-bottom:8px}
  .wall.light{background:
    radial-gradient(60% 50% at 20% 10%, #ffd9c4 0%, transparent 70%),
    radial-gradient(50% 50% at 85% 20%, #cfe3ff 0%, transparent 70%),
    radial-gradient(60% 60% at 60% 95%, #d9f3e6 0%, transparent 70%),
    #f3f1ec}
  .wall.dark{background:
    radial-gradient(60% 50% at 20% 10%, #2a1f3a 0%, transparent 70%),
    radial-gradient(50% 50% at 85% 20%, #0f2744 0%, transparent 70%),
    radial-gradient(60% 60% at 60% 95%, #0f2d26 0%, transparent 70%),
    #0b0b0f}
  .wall.tinted{background:#0a0a0c}
  .ic{margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}
  .ic img{width:var(--s);height:var(--s);border-radius:calc(var(--s) * .2237);display:block;box-shadow:0 1px 3px rgba(0,0,0,.18)}
  .ic figcaption{font-size:11px;color:#777;font-variant-numeric:tabular-nums}
  .dark .ic figcaption,.tinted .ic figcaption{color:#888}
  .tintbg{width:var(--s);height:var(--s);border-radius:calc(var(--s) * .2237);overflow:hidden;
    background:linear-gradient(180deg,#3a3a3e 0%,#1c1c1f 100%);box-shadow:0 1px 3px rgba(0,0,0,.4)}
  .tintbg img{border-radius:0;box-shadow:none;filter:none;
    /* iOS tints the grayscale glyph with the user's color; approximate with a blue mix. */
    mix-blend-mode:screen}
  .tint{position:relative}
  .tint .tintbg{position:relative}
  .tint .tintbg::after{content:"";position:absolute;inset:0;background:#5aa0ff;mix-blend-mode:multiply;pointer-events:none}
</style></head><body><h1>${title}</h1>${items.map(row).join("")}</body></html>`;
writeFileSync(out, html);
console.log("wrote", out);
