import { test, expect, type Locator } from "@playwright/test";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchApp, openEditor, RECORDING_ASSET_ID } from "../e2e/helpers/launch";

/*
 * Editor webcam geometry on the real app (NIW2-635 size range, NIW2-636 edge presets).
 * The script is branch-neutral on purpose: it only reads the DOM, so the same file runs on
 * main, on the size-range branch and on the edge-preset branch, and the logged numbers are
 * the before/after. The seeded take has a webcam file (the fixture video stands in for the
 * face), a sidecar `webcam` field, and a 2x zoom covering the whole recording; the playhead
 * is parked in the middle of it, where the camera has settled at 2x.
 */

const OUT_DIR = path.resolve(__dirname, "..", "test-results", "verify", "webcam");
const FIXTURE = path.resolve(__dirname, "..", "e2e", "fixtures", "sample.mp4");
const RECORDING_ID = "e2e-sample";

async function seedWebcamVault(vaultDir: string): Promise<void> {
  const meta = path.join(vaultDir, ".kaipu");
  await mkdir(meta, { recursive: true });
  await copyFile(FIXTURE, path.join(vaultDir, `${RECORDING_ID}.mp4`));
  await copyFile(FIXTURE, path.join(meta, `${RECORDING_ID}.webcam.mp4`));
  await writeFile(
    path.join(meta, `${RECORDING_ID}.json`),
    JSON.stringify({
      sidecarVersion: 2,
      assetId: RECORDING_ASSET_ID,
      title: "Webcam sample",
      durationSeconds: 3,
      createdAt: 1_700_000_000_000,
      webcam: { startOffsetMs: 0, offsetQuality: "exact", width: 1280, height: 720, fps: 30 },
    }),
  );
  await writeFile(
    path.join(meta, `${RECORDING_ID}.edit.json`),
    JSON.stringify({
      version: 1,
      scene: {
        items: [{ id: "clip-a", kind: "clip", sourceStart: 0, sourceEnd: 3 }],
        overlays: [],
        zoomSegments: [
          {
            id: "zoom-1",
            start: 0,
            end: 3,
            scale: 2,
            mode: "fixed",
            anchor: { x: 0.5, y: 0.5 },
            smoothing: 50,
            origin: "manual",
            trigger: null,
          },
        ],
        redactions: [],
        zoomSensitivity: 50,
        audioMuted: false,
        mutedRanges: [],
      },
    }),
  );
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

async function box(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  });
}

const round = (n: number): number => Math.round(n * 10) / 10;

test("webcam: editor size range, edge presets and drag clamp under a 2x zoom", async () => {
  test.skip(process.platform === "linux", "needs the real app on a desktop");
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const { app, page, teardown } = await launchApp({ seedVault: seedWebcamVault });
  let n = 0;
  const bubble = page.getByTestId("webcam-layer");
  const slot = page.getByTestId("webcam-slot");
  const picture = page.getByTestId("webcam-video");

  /** Wait until the bubble stops moving (the camera spring and the shrink ease). */
  const settle = async (): Promise<void> => {
    let previous = "";
    await expect
      .poll(
        async () => {
          const now = JSON.stringify(await box(bubble));
          const same = now === previous;
          previous = now;
          return same;
        },
        { intervals: [150], timeout: 10_000 },
      )
      .toBe(true);
  };

  const sizeLabel = async (): Promise<string> =>
    page.getByRole("slider", { name: "Size", exact: true }).evaluate((el) => {
      const text = el.parentElement?.querySelector("span[aria-hidden]")?.textContent;
      return text ?? "?";
    });

  const shot = async (step: string): Promise<void> => {
    await settle();
    n += 1;
    const frame = await box(slot);
    const b = await box(bubble);
    const p = await box(picture);
    const rec = {
      step,
      sizeLabel: await sizeLabel(),
      frame: { left: round(frame.left), right: round(frame.right), height: round(frame.height) },
      bubble: { left: round(b.left), right: round(b.right), height: round(b.height) },
      picture: { left: round(p.left), right: round(p.right), height: round(p.height) },
      bubbleHeightOverFrame: Math.round((b.height / frame.height) * 1000) / 1000,
      gapLeftPx: round(b.left - frame.left),
      gapRightPx: round(frame.right - b.right),
    };
    console.log(`[webcam] ${JSON.stringify(rec)}`);
    await page.screenshot({
      path: path.join(OUT_DIR, `${String(n).padStart(2, "0")}-${step}.png`),
    });
  };

  const slider = (): Locator => page.getByRole("slider", { name: "Size", exact: true });
  const setSizeLabel = async (target: string): Promise<void> => {
    await slider().focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 100 && (await sizeLabel()) !== target; i += 1) {
      await page.keyboard.press("ArrowRight");
    }
    expect(await sizeLabel()).toBe(target);
  };

  const preset = async (name: "Left" | "Right"): Promise<void> => {
    await page.getByRole("group", { name: "Position" }).getByRole("button", { name }).click();
  };

  try {
    // The Electron window, not a page viewport: size the BrowserWindow itself.
    const win = await app.browserWindow(page);
    await win.evaluate((w) => {
      w.setSize(1440, 900);
      w.center();
    });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeGreaterThanOrEqual(1400);
    await openEditor(page);
    await expect
      .poll(() => page.evaluate(() => document.querySelector("video")?.videoWidth ?? 0), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    console.log(
      `[webcam] window ${await page.evaluate(() => `${window.innerWidth}x${window.innerHeight}`)}`,
    );
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    // Park the playhead mid-zoom: the main video is the one without the webcam test id.
    await page.evaluate(() => {
      const main = document.querySelector<HTMLVideoElement>(
        "video:not([data-testid='webcam-video'])",
      );
      if (main) main.currentTime = 1.5;
    });

    await bubble.click();
    await page
      .getByRole("group", { name: "Shape" })
      .getByRole("button", { name: "Rectangle" })
      .click();
    const shrink = page.getByLabel("Shrink during zoom");
    await shrink.check();
    await expect(shrink).toBeChecked();
    await shot("setup-rectangle-shrink");

    await slider().focus();
    await page.keyboard.press("Home");
    await shot("size-min");
    await setSizeLabel("60");
    await shot("size-60");
    await slider().focus();
    await page.keyboard.press("End");
    await shot("size-max");

    // Presets at the smallest bubble (full shrink) and at the one labelled 60.
    await slider().focus();
    await page.keyboard.press("Home");
    await preset("Left");
    await shot("preset-left-size-min");
    await preset("Right");
    await shot("preset-right-size-min");

    await setSizeLabel("60");
    await preset("Left");
    await shot("preset-left-size-60");
    await preset("Right");
    await shot("preset-right-size-60");

    // Drag the bubble far past the left edge: the clamp must stop it at the frame.
    const start = await box(bubble);
    const y = start.top + start.height / 2;
    await page.mouse.move(start.left + start.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(2, y, { steps: 30 });
    await page.mouse.up();
    await shot("drag-past-left-edge");
  } finally {
    try {
      await teardown();
    } catch (error) {
      console.error("[verify] webcam: closing the app failed", error);
    }
  }
});
