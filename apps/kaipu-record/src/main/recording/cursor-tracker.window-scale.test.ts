import { expect, it } from "vitest";
import { windowCapturedSpace } from "./captured-display";
import { CursorTrackRegistry, type CursorTrackerDeps } from "./cursor-tracker";
import { windowContentRect } from "./native/window-fit";
import { WindowGeometryLog } from "./window-geometry-log";

const OUT = { width: 800, height: 600 };

/** Samples a moving pointer `samples` times, 8 ms apart, with `entries` geometry changes. */
function take(samples: number, entries: number, clicks = 0) {
  let clock = 0;
  let point = { x: 0, y: 0 };
  let tick: (() => void) | null = null;
  const deps: CursorTrackerDeps = {
    now: () => clock,
    cursorPoint: () => point,
    every: (_ms, fn) => {
      tick = fn;
      return () => {};
    },
  };
  const log = new WindowGeometryLog();
  log.setOutput(OUT);
  const span = samples * 8;
  for (let i = 0; i < entries; i++) {
    const frame = { x: 100 + (i % 50), y: 50, width: 400 + (i % 7), height: 300 };
    log.push({ atMs: (i * span) / entries, frame, content: windowContentRect(frame, OUT) });
  }
  const reg = new CursorTrackRegistry(deps);
  const tracker = reg.start("s", windowCapturedSpace("window:42:0", 2, log)!);
  tracker.setAnchor(0, "exact");
  for (let i = 1; i < samples; i++) {
    clock = i * 8;
    point = { x: 100 + (i % 400), y: 50 + (i % 300) }; // never still: every sample is kept
    tick!();
    if (clicks && i % Math.floor(samples / clicks) === 0) tracker.addClick(0);
  }
  clock = samples * 8;
  return { reg };
}

it("maps 200k samples against 5k geometry entries in well under a second", () => {
  const { reg } = take(200_000, 5_000, 100);
  const started = performance.now();
  const track = reg.finish("s", true)!;
  const elapsed = performance.now() - started;
  expect(track.t.length).toBeGreaterThanOrEqual(199_000);
  expect(track.clicks.length).toBe(99);
  // A sanity bound for a quadratic scan (seconds), not a benchmark of the linear pass.
  console.log(`window map ms: ${elapsed.toFixed(0)}`);
  expect(elapsed).toBeLessThan(500);
});
