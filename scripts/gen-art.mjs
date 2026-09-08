/**
 * Draws garment art for piece types the imported set does not cover.
 *
 * The pipeline lives in `src/lib/art`; this script is the harness around it:
 * it supplies the style examples, a headless-Chrome rasteriser for the review
 * loop, the svgo pass, and the PNG contact sheets a human looks at.
 *
 * Usage:
 *   node scripts/gen-art.mjs --type skirt --model anthropic/claude-opus-5 --iterations 2
 *   node scripts/gen-art.mjs --all --model openai/gpt-5.6-sol
 *   node scripts/gen-art.mjs --sheet                # rebuild the contact sheet only
 *
 * Inference backends (`--backend`):
 *   openrouter  POST https://openrouter.ai/api/v1/chat/completions (needs
 *               OPENROUTER_API_KEY). The default, and what the app will use.
 *   cli         The locally authenticated `claude` / `codex` CLIs, as a stand-in
 *               when no OpenRouter key is present. Same prompts, same models,
 *               but token counts include each CLI's own system prompt, so the
 *               reported cost is an upper bound.
 *
 * The script re-executes itself under `pnpm dlx --package=playwright@latest`
 * so Chrome is available, and under the `tsx` loader so it can import the
 * TypeScript pipeline directly.
 */

import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ART_DIR = path.join(ROOT, "src/components/silhouettes/art");
const OUT_DIR =
  process.env.GEN_ART_OUT ??
  "/private/tmp/claude-501/-Users-lunowe-Coding-Fitsss/9785a64f-9a12-4e25-b8e7-b4f6fa2efa52/scratchpad/genart";

/**
 * Reads `.env.local` for `OPENROUTER_API_KEY` and friends. The app's own env
 * lives there and the shell does not export it, so the script picks it up the
 * same way `next dev` would. Anything already in the environment wins.
 */
function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value && process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}

// ---------------------------------------------------------------- bootstrap

loadEnvLocal();

if (!process.env.FITSSS_ART_BOOT) {
  const args = ["dlx", "--package=playwright@latest", "node", "--import", "tsx", fileURLToPath(import.meta.url), ...process.argv.slice(2)];
  const child = spawn("pnpm", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, FITSSS_ART_BOOT: "1" },
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function requirePlaywright() {
  const req = createRequire(import.meta.url);
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
      /* next */
    }
  }
  return req("playwright");
}

// ------------------------------------------------------------------- args

function parseArgs(argv) {
  const out = { types: [], model: "anthropic/claude-opus-5", iterations: 2, backend: null, sheetOnly: false, precision: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === "--type") out.types.push(next());
    else if (arg === "--all") out.all = true;
    else if (arg === "--model") out.model = next();
    else if (arg === "--iterations") out.iterations = Number(next());
    else if (arg === "--backend") out.backend = next();
    else if (arg === "--sheet") out.sheetOnly = true;
    else if (arg === "--precision") out.precision = Number(next());
    else throw new Error(`unknown flag ${arg}`);
  }
  return out;
}

// -------------------------------------------------------------- rendering

/** Mirrors `Silhouette`'s ink rule so the raster looks like the real app. */
function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const lightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lightness > 0.45 ? "rgb(0 0 0 / 0.62)" : "rgb(255 255 255 / 0.72)";
}

function shadeOf(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const lightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const towards = lightness <= 0.45 ? 255 : 0;
  const mix = (c) => Math.round(c * 0.82 + towards * 0.18);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** One tinted icon, sized like the closet grid sizes it. */
function iconHtml(svg, { fill, size }) {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? "0 0 128 128";
  const body = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1] ?? "";
  const style = `--icon-fill:${fill};--icon-fill-2:${shadeOf(fill)};--icon-stroke:${inkFor(fill)}`;
  return `<svg width="${size}" height="${size}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" style="${style};display:block">${body}</svg>`;
}

const CELLS = [
  { bg: "#ffffff", fill: "#1f2a44" },
  { bg: "#ffffff", fill: "#6b6b3a" },
  { bg: "#ffffff", fill: "#ffffff" },
  { bg: "#1c1c1e", fill: "#ffffff" },
  { bg: "#1c1c1e", fill: "#1f2a44" },
  { bg: "#1c1c1e", fill: "#6b6b3a" },
];
const SIZES = [40, 96, 256];

async function shotPage(page, html, selector = "#sheet") {
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#8a8a8e">${html}</body></html>`, {
    waitUntil: "load",
  });
  const target = await page.$(selector);
  return target.screenshot({ type: "png" });
}

/** The strip a human reviews: every size against every tint, light and dark. */
function stripHtml(svg, label) {
  const rows = CELLS.map(
    (cell) =>
      `<div style="display:flex;align-items:center;gap:20px;background:${cell.bg};padding:14px 20px">` +
      SIZES.map((size) => `<div style="width:${size}px;height:${size}px">${iconHtml(svg, { fill: cell.fill, size })}</div>`).join("") +
      `</div>`,
  ).join("");
  return `<div id="sheet" style="display:inline-block;font:12px -apple-system,sans-serif;background:#fff">
    <div style="padding:8px 20px;background:#e5e5ea;color:#000">${label}</div>${rows}</div>`;
}

/** What the critic sees: three sizes on a white card and on a dark one. */
function critiqueHtml(svg) {
  const row = (bg, fill) =>
    `<div style="display:flex;align-items:center;gap:24px;background:${bg};padding:18px 24px">` +
    SIZES.map((size) => `<div style="width:${size}px;height:${size}px">${iconHtml(svg, { fill, size })}</div>`).join("") +
    `</div>`;
  return `<div id="sheet" style="display:inline-block;background:#fff">${row("#ffffff", "#1f2a44")}${row("#1c1c1e", "#ffffff")}</div>`;
}

// ------------------------------------------------------------------- svgo

function optimise(svg, precision) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fitsss-genart-"));
  const config = path.join(dir, "svgo.mjs");
  fs.writeFileSync(
    config,
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
  const file = path.join(dir, "art.svg");
  fs.writeFileSync(file, svg);
  execFileSync("pnpm", ["dlx", "svgo@latest", "--config", config, "-q", file, "-o", file], { cwd: ROOT, stdio: "pipe" });
  return fs.readFileSync(file, "utf8");
}

/** Fraction of pixels that differ between two renders of the same drawing. */
async function pixelDiff(page, a, b, size = 192) {
  return page.evaluate(
    async ({ a, b, size }) => {
      const draw = async (markup) => {
        const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`;
        const img = new Image();
        img.width = img.height = size;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        return ctx.getImageData(0, 0, size, size).data;
      };
      const paint = (markup) =>
        markup
          .replace(/var\(--icon-fill,\s*[^)]*\)/g, "#b3b3b3")
          .replace(/var\(--icon-fill-2,\s*[^)]*\)/g, "#8c8c8c")
          .replace(/var\(--icon-stroke,\s*[^)]*\)/g, "#000");
      const one = await draw(paint(a));
      const two = await draw(paint(b));
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
    },
    { a, b, size },
  );
}

// --------------------------------------------------------------- backends

/** OpenRouter over plain fetch, via the pipeline's own transport. */
function openRouterBackend(openRouterChat) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return openRouterChat({ apiKey, appUrl: "http://localhost:3100" });
}

/**
 * Runs a CLI once. Two `claude -p` sessions started at the same moment wedge
 * each other, so the timeout is short enough to notice and `runWithRetry`
 * takes another swing rather than burning the whole batch.
 */
function run(command, args, { input, timeoutMs = 300_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${command} exited ${code}: ${stderr.slice(-500)}`));
      else resolve(stdout);
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function runWithRetry(command, args, options, attempts = 2) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run(command, args, options);
    } catch (error) {
      last = error;
      console.log(`  ${command} attempt ${attempt} failed: ${error.message.slice(0, 120)}`);
    }
  }
  throw last;
}

/**
 * The locally authenticated CLIs, standing in for OpenRouter.
 *
 * Both are given the same messages the HTTP call would carry. Images are
 * written to a temp file: `codex` takes one with `-i`, and `claude` is given a
 * Read tool scoped to that directory.
 */
function cliBackend() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fitsss-art-cli-"));
  return async ({ model, messages, json }) => {
    const started = Date.now();
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const user = messages.filter((m) => m.role !== "system");
    let text = "";
    let image = null;
    for (const message of user) {
      if (typeof message.content === "string") text += `${message.content}\n`;
      else {
        for (const part of message.content) {
          if (part.type === "text") text += `${part.text}\n`;
          else if (part.type === "image_url") {
            const base64 = part.image_url.url.replace(/^data:image\/png;base64,/, "");
            image = path.join(tmp, `shot-${Date.now()}.png`);
            fs.writeFileSync(image, Buffer.from(base64, "base64"));
          }
        }
      }
    }

    if (model.startsWith("openai/")) {
      const id = model.replace(/^openai\//, "");
      const args = ["exec", "-m", id, "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-C", tmp, "--json"];
      if (image) args.push("-i", image);
      const prompt = system ? `${system}\n\n---\n\n${text}` : text;
      const out = await runWithRetry("codex", [...args, prompt]);
      let answer = "";
      let usage = { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 };
      for (const line of out.split("\n")) {
        if (!line.startsWith("{")) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "item.completed" && event.item?.type === "agent_message") answer = event.item.text ?? "";
        if (event.type === "turn.completed" && event.usage) {
          usage = {
            prompt_tokens: event.usage.input_tokens ?? 0,
            completion_tokens: (event.usage.output_tokens ?? 0) + (event.usage.reasoning_output_tokens ?? 0),
            cached_tokens: event.usage.cached_input_tokens ?? 0,
          };
        }
      }
      return { text: answer, model, usage, ms: Date.now() - started };
    }

    const id = model.replace(/^anthropic\//, "");
    const args = [
      "-p",
      "--restricted",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--no-session-persistence",
      "--model",
      id,
      "--output-format",
      "json",
    ];
    if (system) args.push("--append-system-prompt", system);
    if (image) {
      args.push("--tools", "Read", "--add-dir", tmp);
      text = `Read the image at ${image}, then answer.\n\n${text}`;
    } else {
      args.push("--tools", "");
    }
    if (json) args.push("--json-schema", VERDICT_SCHEMA);
    const out = await runWithRetry("claude", args, { input: text });
    const parsed = JSON.parse(out);
    if (parsed.is_error) throw new Error(`claude: ${String(parsed.result).slice(0, 300)}`);
    return {
      text: typeof parsed.result === "string" ? parsed.result : JSON.stringify(parsed.result),
      model: id,
      usage: {
        prompt_tokens: (parsed.usage?.input_tokens ?? 0) + (parsed.usage?.cache_creation_input_tokens ?? 0),
        completion_tokens: parsed.usage?.output_tokens ?? 0,
        cached_tokens: parsed.usage?.cache_read_input_tokens ?? 0,
      },
      ms: Date.now() - started,
      cliCostUsd: parsed.total_cost_usd ?? 0,
    };
  };
}

/** Structured-output schema for the critique turn. */
const VERDICT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    recognizable: { type: "number" },
    styleMatch: { type: "number" },
    cleanliness: { type: "number" },
    problems: { type: "array", items: { type: "string" } },
    keep: { type: "boolean" },
  },
  required: ["recognizable", "styleMatch", "cleanliness", "problems", "keep"],
  additionalProperties: false,
});

// -------------------------------------------------------------------- main

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const art = await import("../src/lib/art/index.ts");
  const { BRIEFS, BRIEF_IDS, generateArt, normalizeArt, openRouterChat } = art;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = requirePlaywright();
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ deviceScaleFactor: 2 });

  if (options.sheetOnly) {
    await buildSheet(page, BRIEF_IDS);
    await browser.close();
    return;
  }

  const backend = options.backend ?? (process.env.OPENROUTER_API_KEY ? "openrouter" : "cli");
  const chat = backend === "openrouter" ? openRouterBackend(openRouterChat) : cliBackend();
  if (!chat) throw new Error("OPENROUTER_API_KEY is not set; pass --backend cli");
  console.log(`backend ${backend}, model ${options.model}`);

  const examples = [
    { id: "tee", svg: fs.readFileSync(path.join(ART_DIR, "tee.svg"), "utf8").trim() },
    { id: "sneaker-slip-on", svg: fs.readFileSync(path.join(ART_DIR, "sneaker-slip-on.svg"), "utf8").trim() },
  ];

  const render = async (svg) => {
    const png = await shotPage(page, critiqueHtml(svg));
    return `data:image/png;base64,${png.toString("base64")}`;
  };

  const types = options.all ? BRIEF_IDS : options.types;
  if (!types.length) throw new Error("pass --type <id> or --all");

  for (const type of types) {
    const brief = BRIEFS[type];
    if (!brief) throw new Error(`no brief for ${type}`);
    console.log(`\n=== ${type} (${options.model}) ===`);

    let cliCostUsd = 0;
    const tracking = async (request) => {
      const result = await chat(request);
      cliCostUsd += result.cliCostUsd ?? 0;
      return result;
    };

    const started = Date.now();
    const result = await generateArt({
      brief,
      examples,
      model: options.model,
      iterations: options.iterations,
      chat: tracking,
      render,
      onAttempt: (attempt) => {
        const v = attempt.scores.verdict;
        console.log(
          `  iter ${attempt.iteration}: ${attempt.errors.length ? `REJECTED (${attempt.errors.join("; ")})` : `${attempt.scores.inspection.elements} shapes`}` +
            (v ? `  rec ${v.recognizable} style ${v.styleMatch} clean ${v.cleanliness} keep ${v.keep}` : "") +
            `  total ${attempt.scores.total}  ${(attempt.ms / 1000).toFixed(1)}s`,
        );
        for (const problem of [...(v?.problems ?? []), ...attempt.scores.inspection.problems]) {
          console.log(`      - ${problem}`);
        }
      },
    });

    if (!result.svg) {
      console.log(`  ${type}: nothing usable came back`);
      fs.writeFileSync(path.join(OUT_DIR, `${type}.json`), JSON.stringify({ ...result, failed: true }, null, 2));
      continue;
    }

    // svgo, cheapest precision that still draws the same picture.
    let optimised = result.svg;
    for (const precision of [options.precision, options.precision + 1]) {
      const candidate = optimise(result.svg, precision);
      const diff = await pixelDiff(page, result.svg, candidate);
      if (diff <= 0.014) {
        optimised = candidate;
        console.log(`  svgo precision ${precision}: ${(diff * 100).toFixed(2)}% drift, ${candidate.length} bytes`);
        break;
      }
      console.log(`  svgo precision ${precision}: ${(diff * 100).toFixed(2)}% drift, rejected`);
    }

    const svgPath = path.join(OUT_DIR, `${type}.svg`);
    fs.writeFileSync(svgPath, optimised.endsWith("\n") ? optimised : `${optimised}\n`);

    const strip = await shotPage(page, stripHtml(optimised, `${type} — ${options.model}`));
    fs.writeFileSync(path.join(OUT_DIR, `${type}-review.png`), strip);

    const reparsed = normalizeArt(optimised);
    fs.writeFileSync(
      path.join(OUT_DIR, `${type}.json`),
      JSON.stringify(
        {
          type,
          model: options.model,
          backend,
          promptHash: result.meta.promptHash,
          iterations: result.meta.iterations,
          totalMs: Date.now() - started,
          usage: result.meta.usage,
          costUsd: { openrouterList: result.meta.totalCostUsd, cliReported: cliCostUsd },
          scores: result.scores,
          bytes: optimised.length,
          elements: reparsed.ok ? reparsed.elements : null,
          viewBox: result.viewBox,
          attempts: result.attempts.map((a) => ({
            iteration: a.iteration,
            ms: a.ms,
            usage: a.usage,
            costUsd: a.costUsd,
            total: a.scores.total,
            verdict: a.scores.verdict,
            structural: a.scores.inspection.problems,
            errors: a.errors,
          })),
        },
        null,
        2,
      ),
    );
    console.log(
      `  kept iteration with total ${result.scores.total}; ${(result.meta.totalMs / 1000).toFixed(1)}s, ` +
        `$${result.meta.totalCostUsd.toFixed(4)} at OpenRouter list${cliCostUsd ? ` ($${cliCostUsd.toFixed(4)} billed by the CLI)` : ""}`,
    );
  }

  await buildSheet(page, BRIEF_IDS);
  await browser.close();
}

/** One PNG with every generated drawing next to three imported ones. */
async function buildSheet(page, briefIds) {
  const imported = ["tee", "sneaker-slip-on", "hoodie"];
  const cell = (svg, label, source) =>
    `<div style="width:150px;text-align:center">
       <div style="background:#fff;padding:10px 0">${iconHtml(svg, { fill: "#1f2a44", size: 96 })}</div>
       <div style="background:#1c1c1e;padding:10px 0">${iconHtml(svg, { fill: "#ffffff", size: 96 })}</div>
       <div style="background:#fff;padding:6px 0">${iconHtml(svg, { fill: "#6b6b3a", size: 40 })}</div>
       <div style="font:11px -apple-system,sans-serif;padding:4px;background:${source === "imported" ? "#d1d1d6" : "#e5e5ea"}">${label}</div>
     </div>`;

  const cells = [];
  for (const id of briefIds) {
    const file = path.join(OUT_DIR, `${id}.svg`);
    if (fs.existsSync(file)) cells.push(cell(fs.readFileSync(file, "utf8"), id, "generated"));
  }
  for (const id of imported) {
    cells.push(cell(fs.readFileSync(path.join(ART_DIR, `${id}.svg`), "utf8"), `${id} (imported)`, "imported"));
  }
  const html = `<div id="sheet" style="display:flex;flex-wrap:wrap;gap:6px;width:960px;padding:8px;background:#8a8a8e">${cells.join("")}</div>`;
  const png = await shotPage(page, html);
  const file = path.join(OUT_DIR, "contact-sheet.png");
  fs.writeFileSync(file, png);
  console.log(`\ncontact sheet: ${file}`);
}
