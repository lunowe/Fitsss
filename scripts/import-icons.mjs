/**
 * Imports the technical-flat garment illustrations into
 * `src/components/silhouettes/art`.
 *
 * The source art is a set of Illustrator exports where most files hold a FRONT
 * view next to a BACK view in one viewBox, styling lives in a `<style>` block
 * of `.cls-*` classes, and every file has a different margin. This script
 * normalises all of that:
 *
 *   1. renders each file in headless Chrome so `getBBox()` / `getComputedStyle()`
 *      report real geometry and resolved styles,
 *   2. detects the front/back split from the gap between the two clusters of
 *      bounding boxes and throws the back view away,
 *   3. crops the viewBox to the kept art plus 4% padding,
 *   4. rewrites every class-driven declaration as an attribute, mapping the
 *      dominant grey to `var(--icon-fill)`, other greys to `var(--icon-fill-2)`
 *      and ink to `var(--icon-stroke)`,
 *   5. optimises with svgo at the cheapest precision that still rasterises to
 *      the same picture, and regenerates `art/index.ts`.
 *
 * Idempotent: running it again reproduces the same files byte for byte.
 *
 * Usage:
 *   pnpm dlx --package=playwright@latest node scripts/import-icons.mjs
 *
 * The source art lives outside this repo. Point ICON_SRC at the checkout of the
 * old project if it is not at the default path.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.join(ROOT, "src/components/silhouettes/art");

const SRC_ROOT = process.env.ICON_SRC ?? "/Users/lunowe/Coding/ai-fashion-companion";
const RAW_DIR = path.join(SRC_ROOT, "backend/scripts/svgs");
const EDITED_DIR = path.join(SRC_ROOT, "frontend/src/assets/icons");

/** Rendered stroke width, in CSS px, of a file's dominant stroke. */
const STROKE_PX = 1;
/** Padding added to every side of the crop, as a fraction of the long side. */
const PAD = 0.04;
/**
 * Long side of every icon's viewBox. Cropping to a fixed box makes svgo's
 * simplification budget proportional to how big the art actually renders; too
 * small and thin slivers (button rings, hem facings) round away and flip the
 * winding of the shape they sit in.
 */
const NORM = 128;

/**
 * art id -> source file. `edited` files are the owner's hand-split fronts and
 * are already single view; `raw` files still carry the back view.
 */
const SOURCES = {
  // tops
  tee: { dir: "edited", file: "Tee_4_front.svg" },
  "long-sleeve-tee": { dir: "raw", file: "Tee-18.svg" },
  tank: { dir: "raw", file: "Vest 4.svg" },
  polo: { dir: "edited", file: "Polo_front.svg" },
  henley: { dir: "edited", file: "Henley_front.svg" },
  shirt: { dir: "raw", file: "Tee-13-2.svg" },
  "dress-shirt": { dir: "edited", file: "DressShirt_front.svg" },

  // layers
  sweater: { dir: "raw", file: "Sweater 10.svg" },
  hoodie: { dir: "edited", file: "Hoodie-12_front.svg" },
  sweatshirt: { dir: "raw", file: "Sweater 5.svg" },
  cardigan: { dir: "edited", file: "Cardigan_2_front.svg" },
  turtleneck: { dir: "raw", file: "Sweaters 33.svg" },
  "quarter-zip": { dir: "raw", file: "Men_s Sportwear 4.svg" },
  overshirt: { dir: "raw", file: "Boomber Jacket 8.svg" },
  fleece: { dir: "raw", file: "Jacket 9.svg" },
  vest: { dir: "raw", file: "Gillet 1.svg" },

  // outerwear
  "denim-jacket": { dir: "raw", file: "Denim Jacket 3.svg" },
  bomber: { dir: "raw", file: "Bomber Jacket 1.svg" },
  "leather-jacket": { dir: "raw", file: "Jacket 5.svg" },
  blazer: { dir: "raw", file: "Blazers-1.svg" },
  harrington: { dir: "raw", file: "Bomber Jacket 4.svg" },
  "chore-jacket": { dir: "raw", file: "Jacket 39.svg" },
  "long-coat": { dir: "raw", file: "Blazers.svg" },
  peacoat: { dir: "raw", file: "Technical Jacket 2.svg" },
  puffer: { dir: "raw", file: "Jacket 46.svg" },
  parka: { dir: "raw", file: "Jacket 12.svg" },
  "rain-jacket": { dir: "raw", file: "Jacket 2.svg" },

  // bottoms
  jeans: { dir: "edited", file: "Jeans 1_front.svg" },
  chinos: { dir: "raw", file: "Sweats 9.svg" },
  trousers: { dir: "edited", file: "Sweats_46_front.svg" },
  "cargo-pants": { dir: "raw", file: "Cargo 17.svg" },
  sweatpants: { dir: "raw", file: "Sweats 22.svg" },
  shorts: { dir: "raw", file: "Short 12.svg" },
  "denim-shorts": { dir: "raw", file: "Jorts 4.svg" },

  // footwear
  sneaker: { dir: "raw", file: "Sneaker 12.svg" },
  "sneaker-high-top": { dir: "raw", file: "Sneaker 22.svg" },
  "sneaker-chunky": { dir: "raw", file: "Sneaker 6.svg" },
  "sneaker-running": { dir: "raw", file: "Sneaker 1.svg" },
  "sneaker-retro": { dir: "raw", file: "Sneaker 19.svg" },
  "sneaker-slip-on": { dir: "raw", file: "Sneaker 16.svg" },
  boot: { dir: "raw", file: "Shoes-4.svg" },
  "boot-chelsea": { dir: "raw", file: "Shoes-1.svg" },
  loafer: { dir: "raw", file: "Shoes-2.svg" },
  "dress-shoe": { dir: "raw", file: "Shoes-3.svg" },

  // accessories
  cap: { dir: "raw", file: "Hat 2.svg" },
  beanie: { dir: "raw", file: "Beanies-3.svg" },
  scarf: { dir: "raw", file: "Scarf.svg" },
  backpack: { dir: "raw", file: "Backpack 5.svg" },
  "crossbody-bag": { dir: "raw", file: "Shoulder bag 5.svg" },
  "messenger-bag": { dir: "raw", file: "Shoulder bag 7.svg" },
  "duffel-bag": { dir: "raw", file: "Duffel Bag.svg" },
  tote: { dir: "raw", file: "Tote Bag 6.svg" },
};

/** Files that are single view even though a gap analysis might disagree. */
const FORCE_SINGLE = new Set(["scarf", "crossbody-bag", "messenger-bag", "duffel-bag", "tote"]);

function requirePlaywright() {
  const req = createRequire(import.meta.url);
  // `pnpm dlx` only puts its temp node_modules/.bin on PATH, so look there too.
  const roots = [
    ...(process.env.NODE_PATH ?? "").split(path.delimiter),
    ...process.env.PATH.split(path.delimiter)
      .filter((entry) => entry.endsWith(`node_modules${path.sep}.bin`))
      .map((entry) => path.dirname(entry)),
  ].filter(Boolean);
  for (const root of roots) {
    try {
      return req(path.join(root, "playwright"));
    } catch {
      /* try the next root */
    }
  }
  return req("playwright");
}

/**
 * Runs inside the page. Returns the cleaned inner markup plus the cropped
 * viewBox for one source file, or an explanation of why it failed.
 */
function transform({ strokePx, pad, norm: NORM, forceSingle, prefix }) {
  const SHAPES = "path,polygon,polyline,line,rect,circle,ellipse";
  const svg = document.querySelector("svg");
  if (!svg) return { error: "no <svg> root" };

  const vb = svg.viewBox.baseVal;
  const view = vb && vb.width ? vb : { x: 0, y: 0, width: 1000, height: 1000 };

  // --- styling: resolve `.cls-*` rules ourselves so elements inside <defs>
  // (which Chrome does not lay out) get the same treatment as rendered ones.
  const rules = new Map();
  for (const style of svg.querySelectorAll("style")) {
    const css = style.textContent ?? "";
    for (const block of css.split("}")) {
      const [selectors, body] = block.split("{");
      if (!body) continue;
      const decls = {};
      for (const decl of body.split(";")) {
        const at = decl.indexOf(":");
        if (at < 0) continue;
        decls[decl.slice(0, at).trim()] = decl.slice(at + 1).trim();
      }
      for (const sel of selectors.split(",")) {
        const name = sel.trim().replace(/^\./, "");
        if (!name || /[\s>+~:[]/.test(name)) continue;
        rules.set(name, { ...(rules.get(name) ?? {}), ...decls });
      }
    }
  }
  const declared = (el) => {
    let out = {};
    for (const name of el.classList) out = { ...out, ...(rules.get(name) ?? {}) };
    return out;
  };

  const inDefs = (el) => el.closest("defs,clipPath,mask,marker,symbol,pattern") !== null;
  const shapes = [...svg.querySelectorAll(SHAPES)].filter((el) => !inDefs(el));

  // --- geometry in root user space
  const rootCTM = svg.getScreenCTM();
  const toRoot = rootCTM ? rootCTM.inverse() : null;
  const boxOf = (el) => {
    let b;
    try {
      b = el.getBBox();
    } catch {
      return null;
    }
    if (!Number.isFinite(b.x) || (b.width === 0 && b.height === 0)) return null;
    const m = toRoot && el.getScreenCTM() ? toRoot.multiply(el.getScreenCTM()) : null;
    if (!m) return { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height };
    const xs = [];
    const ys = [];
    for (const [x, y] of [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ]) {
      const p = svg.createSVGPoint();
      p.x = x;
      p.y = y;
      const q = p.matrixTransform(m);
      xs.push(q.x);
      ys.push(q.y);
    }
    return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  };

  // `getBBox()` ignores both clipping and the viewport, so an element can claim
  // far more space than it actually paints. The owner's hand-split fronts hide
  // the back view by narrowing the viewBox rather than deleting it, and several
  // raw files hatch a garment with one full-canvas path clipped to its shape,
  // so both have to be intersected back in.
  const clipBoxes = new Map();
  const clipBoxOf = (id) => {
    if (clipBoxes.has(id)) return clipBoxes.get(id);
    const node = svg.querySelector(`clipPath[id="${id}"]`);
    let box = null;
    for (const child of node ? node.querySelectorAll("*") : []) {
      const b = boxOf(child);
      if (!b) continue;
      box = box
        ? {
            x1: Math.min(box.x1, b.x1),
            y1: Math.min(box.y1, b.y1),
            x2: Math.max(box.x2, b.x2),
            y2: Math.max(box.y2, b.y2),
          }
        : b;
    }
    clipBoxes.set(id, box);
    return box;
  };
  const clipIdOf = (el) => {
    const raw = declared(el)["clip-path"] ?? el.getAttribute("clip-path") ?? "";
    const m = /url\(["']?#([^"')]+)["']?\)/.exec(raw);
    return m ? m[1] : null;
  };
  const clamp = (box, to) => {
    if (!to) return box;
    const out = {
      x1: Math.max(box.x1, to.x1),
      y1: Math.max(box.y1, to.y1),
      x2: Math.min(box.x2, to.x2),
      y2: Math.min(box.y2, to.y2),
    };
    return out.x2 > out.x1 && out.y2 > out.y1 ? out : null;
  };
  const viewport = {
    x1: view.x,
    y1: view.y,
    x2: view.x + view.width,
    y2: view.y + view.height,
  };

  // Snapshot the resolved style: the <style> block is removed further down and
  // a live CSSStyleDeclaration would go blank with it.
  const entries = [];
  for (const el of shapes) {
    const live = getComputedStyle(el);
    if (live.display === "none" || live.visibility === "hidden") continue;
    let box = boxOf(el);
    if (!box) continue;
    for (let node = el; node && node !== svg; node = node.parentElement) {
      const id = clipIdOf(node);
      if (id) box = clamp(box, clipBoxOf(id));
      if (!box) break;
    }
    box = box && clamp(box, viewport);
    if (!box) continue;
    const cs = {
      fill: live.fill,
      stroke: live.stroke,
      strokeWidth: live.strokeWidth,
      fillRule: live.fillRule,
      strokeLinecap: live.strokeLinecap,
      strokeLinejoin: live.strokeLinejoin,
      strokeDasharray: live.strokeDasharray,
    };
    let length = 0;
    try {
      length = el.getTotalLength();
    } catch {
      /* not a geometry element */
    }
    entries.push({ el, box, cs, length });
  }
  if (!entries.length) return { error: "no drawable shapes" };

  // --- front/back split: look for the widest gap near the middle.
  // Elements wider than half the canvas usually hold both views' detail in one
  // path, so they cannot vote on where the gap is.
  let split = null;
  let mode = "single";
  if (!forceSingle) {
    const spans = entries
      .filter((e) => e.box.x2 - e.box.x1 < view.width * 0.55)
      .map((e) => [e.box.x1, e.box.x2])
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [x1, x2] of spans) {
      const last = merged[merged.length - 1];
      if (last && x1 <= last[1] + 0.5) last[1] = Math.max(last[1], x2);
      else merged.push([x1, x2]);
    }
    const centre = view.x + view.width / 2;
    let best = null;
    for (let i = 0; i < merged.length - 1; i += 1) {
      const gap = { from: merged[i][1], to: merged[i + 1][0] };
      const mid = (gap.from + gap.to) / 2;
      const width = gap.to - gap.from;
      if (width < view.width * 0.008) continue;
      if (Math.abs(mid - centre) > view.width * 0.2) continue;
      const left = mid - merged[0][0];
      const right = merged[merged.length - 1][1] - mid;
      const ratio = left / right;
      if (ratio < 0.55 || ratio > 1.8) continue;
      const score = width - Math.abs(mid - centre);
      if (!best || score > best.score) best = { mid, score };
    }
    if (best) {
      split = best.mid;
      mode = "two-view";
    }
  }

  // Everything left of the split is front art. An element that straddles the
  // split carries front detail too, so it stays: its right-hand half falls
  // outside the cropped viewBox and the SVG viewport clips it away. Only such
  // "spanning" elements are excluded from the crop measurement.
  const front = split === null ? entries : entries.filter((e) => e.box.x2 <= split);
  const spanning = split === null ? [] : entries.filter((e) => e.box.x1 < split && e.box.x2 > split);
  if (!front.length) return { error: "split removed everything" };

  const measure = front.length ? front : entries;
  const span = Math.max(
    Math.max(...measure.map((e) => e.box.x2)) - Math.min(...measure.map((e) => e.box.x1)),
    Math.max(...measure.map((e) => e.box.y2)) - Math.min(...measure.map((e) => e.box.y1)),
  );
  // Sub-pixel specks (individual stitch marks) are noise at 40-120px and cost
  // a lot of bytes. Hatching (rib knits, mesh) is drawn as one path whose line
  // work is many times its own outline: at icon size it fills in solid, so it
  // goes too.
  const keepable = (e) => {
    const w = e.box.x2 - e.box.x1;
    const h = e.box.y2 - e.box.y1;
    if (Math.max(w, h) < span * 0.012) return false;
    if (e.length > 0 && e.length > 5 * 2 * (w + h)) return false;
    return true;
  };

  const cropped = front.filter(keepable);
  const kept = [...cropped, ...spanning.filter(keepable)];
  if (!cropped.length) return { error: "nothing left after culling" };
  const dropped = entries.length - kept.length;
  const keptSet = new Set(kept);
  for (const e of entries) if (!keptSet.has(e)) e.el.remove();

  // --- crop and normalise. Every icon ends up in the same 0..NORM box, which
  // keeps svgo's simplification budget proportional to how big the art renders
  // and makes the coordinates short.
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const e of cropped) {
    x1 = Math.min(x1, e.box.x1);
    y1 = Math.min(y1, e.box.y1);
    x2 = Math.max(x2, e.box.x2);
    y2 = Math.max(y2, e.box.y2);
  }
  const padding = Math.max(x2 - x1, y2 - y1) * pad;
  const crop = { x: x1 - padding, y: y1 - padding, w: x2 - x1 + 2 * padding, h: y2 - y1 + 2 * padding };
  const k = NORM / Math.max(crop.w, crop.h);

  // --- colour buckets
  const rgb = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value ?? "");
    if (!m) return null;
    const [r, g, b] = m[1].split(",").map((n) => parseFloat(n));
    return { r, g, b };
  };
  const hex = (c) =>
    "#" + [c.r, c.g, c.b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
  const luma = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

  const areaByFill = new Map();
  for (const e of kept) {
    const c = rgb(e.cs.fill);
    if (!c) continue;
    const key = hex(c);
    const area = Math.max(1, (e.box.x2 - e.box.x1) * (e.box.y2 - e.box.y1));
    areaByFill.set(key, (areaByFill.get(key) ?? 0) + area);
  }
  let dominantFill = null;
  for (const [key, area] of areaByFill) {
    const c = rgb(`rgb(${parseInt(key.slice(1, 3), 16)},${parseInt(key.slice(3, 5), 16)},${parseInt(key.slice(5, 7), 16)})`);
    if (luma(c) < 0.25 || luma(c) > 0.97) continue; // never let ink or paper win
    if (!dominantFill || area > areaByFill.get(dominantFill)) dominantFill = key;
  }
  dominantFill ??= [...areaByFill.keys()][0] ?? null;

  // Only ink strokes vote on the reference width; the paper-white hairlines
  // some files use to hide a seam are drawn at 0.05px and would skew it.
  const widthCount = new Map();
  for (const e of kept) {
    const c = rgb(e.cs.stroke);
    if (!c || luma(c) > 0.94) continue;
    const w = parseFloat(e.cs.strokeWidth);
    if (!Number.isFinite(w) || w <= 0) continue;
    widthCount.set(w, (widthCount.get(w) ?? 0) + 1);
  }
  let dominantWidth = 0;
  for (const [w, n] of widthCount) {
    if (n > (widthCount.get(dominantWidth) ?? 0)) dominantWidth = w;
  }
  dominantWidth = dominantWidth || 1;

  const paints = new Set();
  const paintFor = (value, role) => {
    const c = rgb(value);
    if (!c) return null;
    const l = luma(c);
    if (role === "fill" && hex(c) === dominantFill) {
      paints.add("fill");
      return "var(--icon-fill, #b3b3b3)";
    }
    if (l < 0.25) {
      paints.add("ink");
      return "var(--icon-stroke, #000)";
    }
    if (l > 0.94) {
      // Paper-white: a hairline used to hide a seam, or a knocked-out shape.
      // As a stroke it was invisible over the art, so it stays invisible.
      paints.add("paper");
      return role === "fill" ? "var(--icon-fill, #b3b3b3)" : null;
    }
    if (role === "stroke") {
      paints.add("ink");
      return "var(--icon-stroke, #000)";
    }
    paints.add("fill-2");
    return `var(--icon-fill-2, ${hex(c)})`;
  };

  // --- rewrite every element to plain attributes
  const usedClips = new Set();
  const round = (n, p = 2) => {
    const f = 10 ** p;
    return String(Math.round(n * f) / f);
  };

  for (const el of [...svg.querySelectorAll("*")]) {
    if (el.tagName === "style" || el.tagName === "title" || el.tagName === "desc") {
      el.remove();
    }
  }

  const strip = (el, { keepId = false } = {}) => {
    for (const attr of [...el.attributes]) {
      if (attr.name === "d" || attr.name === "points") continue;
      if (/^(x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|transform|clip-path)$/.test(attr.name)) continue;
      if (keepId && attr.name === "id") continue;
      el.removeAttribute(attr.name);
    }
  };

  /** Prepends the crop-and-normalise transform; svgo bakes it into the data. */
  const normalise = (el) => {
    const own = el.getAttribute("transform");
    el.setAttribute(
      "transform",
      `translate(${round(-crop.x * k, 3)} ${round(-crop.y * k, 3)}) scale(${round(k, 5)})${own ? ` ${own}` : ""}`,
    );
  };

  const styleShape = (el, cs, isClipChild) => {
    const decls = declared(el);
    strip(el);
    normalise(el);

    if (isClipChild) {
      const rule = decls["clip-rule"] ?? decls["fill-rule"];
      if (rule && rule !== "nonzero") el.setAttribute("clip-rule", rule);
      return;
    }

    const fill = paintFor(cs.fill, "fill");
    el.setAttribute("fill", fill ?? "none");
    if (fill) {
      const rule = cs.fillRule ?? decls["fill-rule"];
      if (rule && rule !== "nonzero") el.setAttribute("fill-rule", rule);
    }

    const stroke = paintFor(cs.stroke, "stroke");
    if (stroke) {
      const w = parseFloat(cs.strokeWidth);
      el.setAttribute("stroke", stroke);
      const scaledWidth = Math.min(2.4, Math.max(0.4, (w / dominantWidth) * strokePx));
      el.setAttribute("stroke-width", round(scaledWidth));
      el.setAttribute("vector-effect", "non-scaling-stroke");
      if (cs.strokeLinecap && cs.strokeLinecap !== "butt")
        el.setAttribute("stroke-linecap", cs.strokeLinecap);
      if (cs.strokeLinejoin && cs.strokeLinejoin !== "miter")
        el.setAttribute("stroke-linejoin", cs.strokeLinejoin);
      const dash = cs.strokeDasharray;
      if (dash && dash !== "none") {
        const scaled = dash
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((n) => round(parseFloat(n) * k, 2))
          .join(" ");
        el.setAttribute("stroke-dasharray", scaled);
      }
    }

    // A shape with neither paint left is invisible; it only costs bytes.
    if (!fill && !stroke) el.remove();
  };

  // clip-path attributes first, so we know which defs survive
  for (const el of [...svg.querySelectorAll("*")]) {
    if (inDefs(el)) continue;
    const clip = clipIdOf(el);
    if (clip) {
      usedClips.add(clip);
      el.setAttribute("clip-path", `url(#${prefix}-${clip})`);
    }
  }

  for (const e of kept) styleShape(e.el, e.cs, false);

  // groups: drop everything but transform/clip-path, remove empties
  for (const g of [...svg.querySelectorAll("g")]) {
    if (inDefs(g)) continue;
    strip(g);
  }
  for (let pass = 0; pass < 6; pass += 1) {
    for (const g of [...svg.querySelectorAll("g")]) {
      if (inDefs(g)) continue;
      if (!g.querySelector(SHAPES)) g.remove();
    }
  }

  // defs: keep only referenced clipPaths, namespaced
  for (const defs of [...svg.querySelectorAll("defs")]) {
    for (const node of [...defs.children]) {
      const id = node.getAttribute("id");
      if (node.tagName !== "clipPath" || !id || !usedClips.has(id)) {
        node.remove();
        continue;
      }
      strip(node, { keepId: true });
      node.setAttribute("id", `${prefix}-${id}`);
      for (const child of [...node.querySelectorAll("*")]) styleShape(child, null, true);
    }
    if (!defs.children.length) defs.remove();
  }

  const viewBox = `0 0 ${round(crop.w * k, 2)} ${round(crop.h * k, 2)}`;

  return {
    viewBox,
    body: svg.innerHTML.replace(/\s+/g, " ").trim(),
    mode,
    kept: kept.length,
    dropped,
    dominantFill,
    dominantWidth,
    paints: [...paints],
  };
}

/**
 * Runs inside the page: rasterises two SVG strings at the same size and returns
 * the fraction of pixels that differ.
 */
async function compare({ a, b, size }) {
  // Rasterise large, then let the canvas box-filter it down: sub-pixel drift in
  // a rounded outline averages away, while a filled-in hole or a lost shape
  // survives as a solid patch of the wrong colour.
  const draw = (text) =>
    new Promise((resolve, reject) => {
      const box = /viewBox="([\d.\-\s]+)"/.exec(text);
      const [, , w, h] = box ? box[1].trim().split(/\s+/).map(Number) : [0, 0, 1, 1];
      const big = size * 4;
      const scale = big / Math.max(w, h);
      // Strokes are dropped: a rounded outline always jitters by a fraction of
      // a pixel, which would drown out the signal. Only the filled areas — the
      // things a collapsed sliver actually destroys — are compared.
      const sized = text
        .replace(/stroke="[^"]*"/g, 'stroke="none"')
        .replace(
          "<svg ",
          `<svg width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" `,
        );
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, image.width / 4, image.height / 4);
        resolve(ctx.getImageData(0, 0, size, size).data);
      };
      image.onerror = () => reject(new Error("could not rasterise"));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
    });

  const [one, two] = await Promise.all([draw(a), draw(b)]);
  let differing = 0;
  for (let i = 0; i < one.length; i += 4) {
    const delta = Math.max(
      Math.abs(one[i] - two[i]),
      Math.abs(one[i + 1] - two[i + 1]),
      Math.abs(one[i + 2] - two[i + 2]),
      Math.abs(one[i + 3] - two[i + 3]),
    );
    if (delta > 40) differing += 1;
  }
  return differing / (one.length / 4);
}

async function main() {
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const file of fs.readdirSync(OUT_DIR)) {
    if (file.endsWith(".svg")) fs.unlinkSync(path.join(OUT_DIR, file));
  }

  const results = {};
  for (const [id, src] of Object.entries(SOURCES)) {
    const from = path.join(src.dir === "raw" ? RAW_DIR : EDITED_DIR, src.file);
    const raw = fs
      .readFileSync(from, "utf8")
      .replace(/<\?xml[^>]*\?>/g, "")
      .replace(/<!DOCTYPE[^>]*>/g, "");

    await page.setContent(
      `<!doctype html><html><body style="margin:0">${raw}</body></html>`,
      { waitUntil: "load" },
    );
    await page.evaluate(() => {
      const svg = document.querySelector("svg");
      if (svg) {
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("style", "width:800px;height:auto;display:block");
      }
    });

    const out = await page.evaluate(transform, {
      strokePx: STROKE_PX,
      pad: PAD,
      norm: NORM,
      forceSingle: FORCE_SINGLE.has(id),
      prefix: id,
    });
    if (out.error) throw new Error(`${id} (${src.file}): ${out.error}`);

    fs.writeFileSync(
      path.join(OUT_DIR, `${id}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${out.viewBox}">${out.body}</svg>\n`,
    );
    results[id] = out;
    console.log(
      `${id.padEnd(18)} ${src.file.padEnd(26)} ${out.mode.padEnd(9)} keep ${String(out.kept).padStart(4)} drop ${String(out.dropped).padStart(4)}  ${out.paints.join("+")}`,
    );
  }

  // --- svgo, cheapest setting that still draws the same picture.
  //
  // `convertPathData` is what buys the compression, but at a coarse precision it
  // rounds thin slivers (a button ring, a hem facing) away, and a collapsed
  // sliver flips the winding of the shape around it into a solid blob. So each
  // icon is optimised at both precisions, both are rasterised against the
  // untouched version, and the cheapest one that matches wins.
  // Fill-only pixel budget: below this an icon only jitters, above it a shape
  // has actually changed.
  const TOL = 0.014;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "fitsss-icons-"));
  const dirs = { pre: path.join(work, "pre"), p1: path.join(work, "p1"), p2: path.join(work, "p2") };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  const ids = Object.keys(SOURCES).sort();
  for (const id of ids) {
    for (const dir of Object.values(dirs)) {
      fs.copyFileSync(path.join(OUT_DIR, `${id}.svg`), path.join(dir, `${id}.svg`));
    }
  }

  const svgoConfig = (precision) => {
    const file = path.join(work, `svgo-${precision}.mjs`);
    fs.writeFileSync(
      file,
      `export default {
  multipass: true,
  js2svg: { indent: 0, pretty: false },
  plugins: [
    { name: "preset-default", params: { overrides: {
      removeUnknownsAndDefaults: false,
      removeUselessStrokeAndFill: false,
      cleanupIds: false,
      convertPathData: { floatPrecision: ${precision}, transformPrecision: 8 },
      cleanupNumericValues: { floatPrecision: ${precision} },
      convertTransform: { floatPrecision: 8 },
      mergePaths: false,
    } } },
  ],
};
`,
    );
    return file;
  };
  for (const [precision, dir] of [
    [1, dirs.p1],
    [2, dirs.p2],
  ]) {
    execFileSync("pnpm", ["dlx", "svgo@latest", "--config", svgoConfig(precision), "-q", "-f", dir, "-o", dir], {
      stdio: "inherit",
      cwd: ROOT,
    });
  }

  const read = (dir, id) => fs.readFileSync(path.join(dir, `${id}.svg`), "utf8");
  const choices = [];
  for (const id of ids) {
    const reference = read(dirs.pre, id);
    let picked = "pre";
    const seen = [];
    for (const [name, dir] of [
      ["p1", dirs.p1],
      ["p2", dirs.p2],
    ]) {
      const ratio = await page.evaluate(compare, { a: reference, b: read(dir, id), size: 128 });
      seen.push(`${name} ${(ratio * 100).toFixed(2)}%`);
      if (ratio <= TOL) {
        picked = name;
        break;
      }
    }
    fs.copyFileSync(path.join(dirs[picked], `${id}.svg`), path.join(OUT_DIR, `${id}.svg`));
    choices.push([id, picked, seen.join(" ")]);
  }
  // ICON_DIFF=1 prints the pixel diff for every icon, to retune TOL.
  if (process.env.ICON_DIFF) for (const c of choices) console.log(`  ${c[0].padEnd(18)} ${c[1]}  ${c[2]}`);
  const exact = choices.filter(([, p]) => p !== "p1");
  if (exact.length) {
    console.log("\nkept extra precision for:");
    for (const [id, p, seen] of exact) console.log(`  ${id.padEnd(18)} ${p}  (${seen})`);
  }

  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });

  // --- registry
  let bytes = 0;
  const rows = ids.map((id) => {
    const text = fs.readFileSync(path.join(OUT_DIR, `${id}.svg`), "utf8");
    bytes += Buffer.byteLength(text);
    const viewBox = /viewBox="([^"]+)"/.exec(text)?.[1] ?? "0 0 100 100";
    const body = text.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
    return `  "${id}": {\n    viewBox: "${viewBox}",\n    body: ${JSON.stringify(body)},\n  },`;
  });

  fs.writeFileSync(
    path.join(OUT_DIR, "index.ts"),
    `/**
 * Generated by scripts/import-icons.mjs. Do not edit by hand.
 *
 * One technical-flat garment drawing per art id. \`body\` is the inner markup of
 * the SVG; the Silhouette component inlines it and supplies --icon-fill,
 * --icon-fill-2 and --icon-stroke.
 */

export interface ArtPiece {
  viewBox: string;
  body: string;
}

export const ART: Record<string, ArtPiece> = {
${rows.join("\n")}
};

export type ArtId = keyof typeof ART;
`,
  );

  console.log(`\n${ids.length} icons, ${(bytes / 1024).toFixed(1)} KB total`);
  const heavy = ids
    .map((id) => [id, fs.statSync(path.join(OUT_DIR, `${id}.svg`)).size])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  for (const [id, size] of heavy) console.log(`  ${id.padEnd(18)} ${(size / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
