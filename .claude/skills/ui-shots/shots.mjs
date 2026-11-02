#!/usr/bin/env bun
// Screenshot an HTML mockup (or any URL) in headless Chrome, without Electron.
//
//   bun .claude/skills/ui-shots/shots.mjs <html-file-or-url> <out-dir> [options] [step ...]
//
// Steps (default: `full`). Append ` as <name>` to name the PNG(s):
//   full                  full-page shot                      -> <name|full>.png
//   el:<selector>         one element                         -> <name|slug>.png
//   hover:<selector>      element at rest, then hovered       -> <name>-rest.png, <name>-hover.png
//   hoverctx:<selector>   like hover, but the shot is of the element's parent
//
// Options:
//   --viewport=1440x720   window size (default 1440x720)
//   --scale=2             deviceScaleFactor (default 2)
//   --wait=300            ms to let the UI settle before every shot (default 300)
//   --css=<file|text>     extra CSS injected after the freeze (file path or inline text)
//   --no-freeze           do not pause animations / disable transitions
//
// Playwright's own Chromium is not downloaded on this machine and browsers must not be
// installed, so this launches the system Google Chrome. Override with CHROME_PATH.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FREEZE_CSS =
  "*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;" +
  "transition:none!important;caret-color:transparent!important}";

function fail(message) {
  console.error(`ui-shots: ${message}`);
  process.exit(1);
}

// playwright-core is not hoisted, so it lives under node_modules/.bun/playwright-core@<version>.
// Glob for it instead of pinning the version, and try the worktree first, then the main checkout.
function findPlaywright() {
  if (process.env.PLAYWRIGHT_CORE_DIR) {
    const dir = resolve(process.env.PLAYWRIGHT_CORE_DIR);
    if (existsSync(join(dir, "index.mjs"))) return join(dir, "index.mjs");
    fail(`PLAYWRIGHT_CORE_DIR=${dir} has no index.mjs.`);
  }
  const roots = [resolve(import.meta.dirname, "../../..")];
  try {
    const common = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: roots[0],
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    roots.push(dirname(common)); // the main checkout when this is a linked worktree
  } catch {}
  for (const root of roots) {
    const store = join(root, "node_modules/.bun");
    if (!existsSync(store)) continue;
    const found = readdirSync(store)
      .filter((d) => d.startsWith("playwright-core@"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const latest = found.at(-1);
    if (latest) return join(store, latest, "node_modules/playwright-core/index.mjs");
  }
  return fail(
    "playwright-core not found under node_modules/.bun/playwright-core@*. " +
      "Run `bun install` in the repo root (or set PLAYWRIGHT_CORE_DIR).",
  );
}

function parseArgs(argv) {
  const positional = [];
  const opts = { viewport: "1440x720", scale: "2", wait: "300", css: "", freeze: true };
  for (const arg of argv) {
    if (arg === "--no-freeze") opts.freeze = false;
    else if (arg.startsWith("--")) {
      const [key, ...rest] = arg.slice(2).split("=");
      if (!(key in opts) || key === "freeze") fail(`unknown option --${key}`);
      opts[key] = rest.join("=");
    } else positional.push(arg);
  }
  const [target, outDir, ...steps] = positional;
  if (!target || !outDir) {
    fail(
      "usage: shots.mjs <html-file-or-url> <out-dir> [options] [step ...] (see the file header)",
    );
  }
  return { target, outDir, steps: steps.length ? steps : ["full"], opts };
}

function parseStep(raw) {
  // The last " as " names the PNG, so a selector may contain the text itself ("Save as draft").
  const at = raw.lastIndexOf(" as ");
  const body = at === -1 ? raw : raw.slice(0, at);
  const name = at === -1 ? undefined : raw.slice(at + 4);
  const idx = body.indexOf(":");
  const kind = idx === -1 ? body : body.slice(0, idx);
  const selector = idx === -1 ? "" : body.slice(idx + 1);
  if (!["full", "el", "hover", "hoverctx"].includes(kind)) fail(`unknown step "${raw}"`);
  if (kind !== "full" && !selector) fail(`step "${raw}" needs a selector (${kind}:<selector>)`);
  const slug = (selector || kind)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return { kind, selector, name: (name ?? (kind === "full" ? "full" : slug)).trim() };
}

const { target, outDir, steps, opts } = parseArgs(process.argv.slice(2));
const parsedSteps = steps.map(parseStep);

const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME;
if (!existsSync(chromePath)) {
  fail(
    `Chrome not found at ${chromePath}. Install Google Chrome or set CHROME_PATH. ` +
      "Do not install Playwright browsers.",
  );
}

const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
if (!isUrl && !existsSync(target)) fail(`file not found: ${target}`);
const url = isUrl ? target : pathToFileURL(resolve(target)).href;

const [width, height] = opts.viewport.split("x").map(Number);
if (!width || !height) fail(`bad --viewport "${opts.viewport}", expected WIDTHxHEIGHT`);
const wait = Number(opts.wait);

const { chromium } = await import(pathToFileURL(findPlaywright()).href);
mkdirSync(outDir, { recursive: true });

const written = [];
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: Number(opts.scale),
  });
  await page.goto(url, { waitUntil: "load" });
  if (opts.freeze) await page.addStyleTag({ content: FREEZE_CSS });
  if (opts.css) {
    await page.addStyleTag({
      content: existsSync(opts.css) ? readFileSync(opts.css, "utf8") : opts.css,
    });
  }
  await page.evaluate(() => document.fonts.ready);
  if (opts.freeze) {
    // `animation-play-state: paused` stops an animation where load left it; rewinding makes
    // every run start from the same frame (a negative delay from --css still applies on top).
    await page.evaluate(() =>
      document.getAnimations().forEach((animation) => {
        animation.pause();
        animation.currentTime = 0;
      }),
    );
  }

  const shoot = async (shooter, file, options = {}) => {
    const path = join(outDir, file);
    await shooter.screenshot({ path, ...options });
    written.push(path);
  };

  /** Move the pointer to a viewport corner outside `box`, so nothing under it stays hovered. */
  const park = async (box) => {
    const corners = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ];
    const inside = ([x, y]) =>
      box && x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
    const corner = corners.find((point) => !inside(point));
    if (!corner)
      console.warn("ui-shots: the target covers the viewport; its rest shot may be hovered");
    const [x, y] = corner ?? corners[3];
    await page.mouse.move(x, y);
    // Let the UI settle (a delayed modal, a hover transition ending) before every shot.
    await page.waitForTimeout(wait);
  };

  for (const step of parsedSteps) {
    if (step.kind === "full") {
      await park(null);
      await shoot(page, `${step.name}.png`, { fullPage: true });
      continue;
    }
    const el = page.locator(step.selector).first();
    if ((await page.locator(step.selector).count()) === 0)
      fail(`no element matches "${step.selector}"`);
    if (step.kind === "el") {
      await park(await el.boundingBox());
      await shoot(el, `${step.name}.png`);
      continue;
    }
    const subject = step.kind === "hoverctx" ? el.locator("xpath=..") : el;
    // Outside the shot's subject, so the first shot is a true rest state.
    await park(await subject.boundingBox());
    await shoot(subject, `${step.name}-rest.png`);
    await el.hover();
    await page.waitForTimeout(wait);
    await shoot(subject, `${step.name}-hover.png`);
  }
} finally {
  await browser.close();
}

for (const path of written) console.log(`${path}  ${statSync(path).size} bytes`);
