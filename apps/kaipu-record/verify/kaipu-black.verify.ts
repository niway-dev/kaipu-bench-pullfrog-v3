import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { dismissOnboarding, launchApp, RECORDING_ASSET_ID } from "../e2e/helpers/launch";

/*
 * Kaipu Black legibility and sidebar modes (NIW2-626): every main page at 1440×900, then the
 * three rail modes. Self-contained (it does not use ./helpers' startScenario) because it needs
 * the Electron app handle to size the window, and so the same file runs on a tree from before
 * the change, where the sidebar toggle does not exist: the mode shots are skipped there.
 */
const NAME = "kaipu-black";
const OUT_DIR = path.resolve(__dirname, "..", "test-results", "verify", NAME);
const WIDTH = 1440;
const HEIGHT = 900;

/** The window presets resize on navigation, so the size is set again before every shot. */
async function sizeWindow(
  app: ElectronApplication,
  page: Page,
  [width, height]: [number, number] = [WIDTH, HEIGHT],
): Promise<void> {
  const handle = await app.browserWindow(page);
  await handle.evaluate((w, [wd, ht]) => w.setSize(wd, ht), [width, height]);
  await page.waitForFunction((wd) => window.innerWidth === wd, width);
}

test("kaipu black: pages and sidebar modes at 1440x900", async () => {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const { app, page, teardown } = await launchApp({ recordVideoDir: OUT_DIR });
  const shot = async (name: string, size?: [number, number]): Promise<void> => {
    await sizeWindow(app, page, size);
    // Let fonts, thumbnails and the width transition settle.
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  };
  const go = (hash: string) => page.evaluate((h) => (location.hash = h), hash);

  try {
    await dismissOnboarding(page);
    // The first-run "New: workspaces" note in the title bar is not what these shots are about.
    const gotIt = page.getByRole("button", { name: "Got it" });
    if (await gotIt.isVisible().catch(() => false)) await gotIt.click();

    // A plain launch, before anything resizes the window: on a build with the rail modes the
    // rail opens expanded (the label under each icon).
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const plainNav = page.locator("nav[data-mode]");
    if ((await plainNav.count()) > 0)
      await expect(plainNav).toHaveAttribute("data-mode", "stacked");
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, "00-plain-launch.png") });

    await go("#/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await shot("01-record");

    await go("#/screenshots");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await shot("02-screenshots");

    await go("#/library");
    await expect(page.getByText("E2E Sample", { exact: true }).first()).toBeVisible();
    await shot("03-library");

    await go("#/settings");
    await expect(page.getByRole("heading", { name: "General" }).first()).toBeVisible();
    await shot("04-settings");

    await go(`#/library/${RECORDING_ASSET_ID}`);
    await page.getByRole("button", { name: "Edit video" }).click();
    await page.waitForFunction(() => location.hash.startsWith("#/editor/video/"));
    await page.waitForSelector("video");
    await shot("05-editor");

    // The rail modes exist only after NIW2-626.
    const toggle = page.getByRole("button", { name: /(Collapse|Expand) sidebar/ });
    await go("#/library");
    await expect(page.getByText("E2E Sample", { exact: true }).first()).toBeVisible();
    if ((await toggle.count()) === 0) {
      console.log(`[verify] ${NAME}: no sidebar toggle in this build, mode shots skipped`);
      return;
    }
    const nav = page.locator("nav[data-mode]");
    await expect(nav).toHaveAttribute("data-mode", "stacked");
    await shot("06-sidebar-expanded");
    // The toggle sits in the title bar right after the logo (NIW2-626): the bar's left end.
    await page.screenshot({
      path: path.join(OUT_DIR, "12-titlebar-toggle-crop.png"),
      clip: { x: 0, y: 0, width: 420, height: 48 },
    });

    // The keyboard path: Cmd+\ collapses to icons. Focus an item so its tooltip shows.
    await page.keyboard.press("Meta+Backslash");
    await expect(nav).toHaveAttribute("data-mode", "collapsed");
    await page.getByRole("link", { name: "Library" }).focus();
    await expect(page.locator("[data-rail-tooltip]")).toHaveText("Library");
    await shot("07-sidebar-collapsed");

    // And the button expands it again.
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(nav).toHaveAttribute("data-mode", "stacked");
  } finally {
    try {
      await teardown();
    } catch (error) {
      console.error(`[verify] ${NAME}: closing the app failed`, error);
    }
    // One .webm per window; keep the biggest (the main window) as video.webm.
    const clips = await Promise.all(
      (await readdir(OUT_DIR))
        .filter((f) => f.endsWith(".webm"))
        .map(async (f) => ({ f, size: (await stat(path.join(OUT_DIR, f))).size })),
    );
    clips.sort((a, b) => b.size - a.size);
    for (const [i, { f }] of clips.entries()) {
      if (i === 0) await rename(path.join(OUT_DIR, f), path.join(OUT_DIR, "video.webm"));
      else await rm(path.join(OUT_DIR, f));
    }
    for (const f of (await readdir(OUT_DIR)).sort()) {
      console.log(`[verify] ${NAME}: ${f} (${(await stat(path.join(OUT_DIR, f))).size} bytes)`);
    }
  }
});
