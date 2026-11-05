import { test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dismissOnboarding, launchApp } from "../e2e/helpers/launch";

/**
 * NIW2-638: the floating camera bubble (Rectangle) could not reach the left/right screen edge,
 * because its window stayed square and the clamp counted the transparent side bands as visible.
 *
 * For Rectangle and Square this scenario turns the camera on (fake device), drags the bubble far
 * past the left and the right edge of the display's work area, and logs, per case, the window
 * bounds, the work area and the VISIBLE bubble rect (getBoundingClientRect of the shape element
 * in the bubble renderer) as a gap to the work-area edge in DIP.
 *
 * What goes through the real path: the drag is real pointer input on the bubble window
 * (page.mouse -> the renderer's pointer handlers -> beginMove/moveBy IPC -> main clamp). If that
 * does not move the window, the scenario calls the same two IPC methods from the bubble page
 * (`window.electronAPI.beginCameraBubbleMove` / `moveCameraBubble`) and says so in `driver`.
 * Camera on and the shape go through the main window's `electronAPI` (`updateRecordingSettings`,
 * `updateSettings`), the same calls the Record panel's toggle and the shape chips make.
 */

const OUT_DIR = path.resolve(__dirname, "..", "test-results", "verify", "camera-bubble");

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CaseResult {
  shape: string;
  side: "left" | "right";
  driver: "pointer" | "ipc";
  windowBounds: Rect;
  workArea: Rect;
  visibleBubbleInWindow: Rect;
  visibleBubbleGlobal: Rect;
  gapToEdgeDip: number;
}

type ElectronAPI = {
  updateSettings(patch: unknown): Promise<unknown>;
  updateRecordingSettings(patch: unknown): void;
  beginCameraBubbleMove(): void;
  moveCameraBubble(dx: number, dy: number): void;
};

async function bubbleWindowBounds(app: ElectronApplication): Promise<{ win: Rect; work: Rect }> {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("window=camera-bubble"),
    );
    if (!win) throw new Error("no camera-bubble window");
    const b = win.getBounds();
    return { win: b, work: screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea };
  });
}

async function findBubblePage(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const page = app
      .windows()
      .find((p) => p.url().includes("window=camera-bubble") && !p.isClosed());
    if (page) {
      await page.getByTestId("camera-bubble").waitFor({ state: "visible", timeout: 10_000 });
      return page;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("the camera-bubble window never opened");
}

test("camera-bubble: Rectangle and Square reach the left and right edge", async () => {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const {
    app,
    page: main,
    teardown,
  } = await launchApp({
    // The runner has no camera: Chromium's synthetic device feeds the bubble.
    extraArgs: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const results: CaseResult[] = [];
  try {
    await dismissOnboarding(main);
    const callMain = <K extends keyof ElectronAPI>(method: K, arg: unknown): Promise<unknown> =>
      main.evaluate(
        ([m, a]) =>
          (
            window as unknown as { electronAPI: Record<string, (x: unknown) => unknown> }
          ).electronAPI[m as string](a),
        [method, arg] as const,
      );

    const defaults = (await main.evaluate(() =>
      (
        window as unknown as { electronAPI: { getSettings(): Promise<{ cameraBubble: unknown }> } }
      ).electronAPI.getSettings(),
    )) as { cameraBubble: Record<string, unknown> };

    let n = 0;
    for (const shape of ["rectangle", "rounded"] as const) {
      // Fresh window per shape: camera off, shape, camera on.
      await callMain("updateRecordingSettings", { isCameraEnabled: false });
      await new Promise((r) => setTimeout(r, 500));
      await callMain("updateSettings", { cameraBubble: { ...defaults.cameraBubble, shape } });
      await callMain("updateRecordingSettings", { isCameraEnabled: true });
      const bubblePage = await findBubblePage(app);
      await new Promise((r) => setTimeout(r, 1500));

      for (const side of ["left", "right"] as const) {
        const before = await bubbleWindowBounds(app);
        const reach = before.work.width * 2;
        const dx = side === "left" ? -reach : reach;

        // Real drag: press on the bubble, move far past the edge, release.
        const box = await bubblePage.getByTestId("camera-bubble").boundingBox();
        if (!box) throw new Error("bubble has no box");
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await bubblePage.mouse.move(cx, cy);
        await bubblePage.mouse.down();
        const steps = 24;
        for (let i = 1; i <= steps; i += 1) {
          await bubblePage.mouse.move(cx + (dx * i) / steps, cy);
        }
        await bubblePage.mouse.up();
        await new Promise((r) => setTimeout(r, 300));

        let driver: CaseResult["driver"] = "pointer";
        let after = await bubbleWindowBounds(app);
        const moved = side === "left" ? before.win.x - after.win.x : after.win.x - before.win.x;
        if (moved < 50) {
          // Pointer events did not move the window (not reachable from the driver): same IPC
          // calls the renderer's handlers make.
          driver = "ipc";
          await bubblePage.evaluate((d) => {
            const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
            api.beginCameraBubbleMove();
            api.moveCameraBubble(d, 0);
          }, dx);
          await new Promise((r) => setTimeout(r, 300));
          after = await bubbleWindowBounds(app);
        }

        // Move the pointer off the bubble so no hover chrome is in the shot.
        await bubblePage.mouse.move(-5, -5);
        await new Promise((r) => setTimeout(r, 300));
        const rect = await bubblePage.getByTestId("camera-bubble").evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        });
        const global: Rect = {
          x: after.win.x + rect.x,
          y: after.win.y + rect.y,
          width: rect.width,
          height: rect.height,
        };
        const gap =
          side === "left"
            ? global.x - after.work.x
            : after.work.x + after.work.width - (global.x + global.width);
        const result: CaseResult = {
          shape,
          side,
          driver,
          windowBounds: after.win,
          workArea: after.work,
          visibleBubbleInWindow: rect,
          visibleBubbleGlobal: global,
          gapToEdgeDip: Math.round(gap * 100) / 100,
        };
        results.push(result);
        console.log(`[camera-bubble] ${JSON.stringify(result)}`);
        n += 1;
        await bubblePage.screenshot({
          path: path.join(OUT_DIR, `${String(n).padStart(2, "0")}-${shape}-${side}.png`),
        });
      }
    }
    await main.screenshot({ path: path.join(OUT_DIR, "99-main-window.png") });
  } finally {
    await writeFile(path.join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
    try {
      await teardown();
    } catch (error) {
      console.error("[verify] camera-bubble: closing the app failed", error);
    }
  }
});
