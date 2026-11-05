import { describe, expect, it } from "vitest";
import { serializeCursorTrack } from "@shared/cursor-track";
import { windowCapturedSpace } from "./captured-display";
import {
  type CapturedDisplay,
  CursorTrackRegistry,
  type CursorTrackerDeps,
} from "./cursor-tracker";
import { windowContentRect } from "./native/window-fit";
import { WindowGeometryLog } from "./window-geometry-log";

type Rect = { x: number; y: number; width: number; height: number };
const OUT = { width: 800, height: 600 };

/** A geometry as the helper reports it: the fit is the shared source of truth. */
const geo = (atMs: number, frame: Rect) => ({
  atMs,
  frame,
  content: windowContentRect(frame, OUT),
});

function fakeDeps() {
  let clock = 0;
  let point = { x: 0, y: 0 };
  let fn: (() => void) | null = null;
  let last = 0;
  const interval = 8;
  const deps: CursorTrackerDeps = {
    now: () => clock,
    cursorPoint: () => point,
    every: (_ms, f) => {
      fn = f;
      last = clock;
      return () => {
        fn = null;
      };
    },
  };
  return {
    deps,
    move: (x: number, y: number) => {
      point = { x, y };
    },
    tick: (ms: number) => {
      const end = clock + ms;
      while (fn && last + interval <= end) {
        last += interval;
        clock = last;
        fn();
      }
      clock = end;
    },
  };
}

function windowTake(frame: Rect, scale = 2) {
  const f = fakeDeps();
  const log = new WindowGeometryLog();
  log.setOutput(OUT);
  log.push(geo(0, frame));
  const space = windowCapturedSpace("window:42:0", scale, log)!;
  const reg = new CursorTrackRegistry(f.deps);
  return { f, log, space, reg };
}

describe("cursor track for a window take", () => {
  it("maps the pointer into the output frame: top-left and centre", () => {
    const { f, space, reg } = windowTake({ x: 100, y: 50, width: 400, height: 300 });
    const tracker = reg.start("s", space);
    tracker.setAnchor(0, "exact");
    f.move(100, 50);
    f.tick(16);
    f.move(300, 200);
    f.tick(16);
    const track = reg.finish("s", false)!;
    expect(track.x[0]).toBeCloseTo(0, 6);
    expect(track.y[0]).toBeCloseTo(0, 6);
    expect(track.x.at(-1)).toBeCloseTo(0.5, 6);
    expect(track.y.at(-1)).toBeCloseTo(0.5, 6);
  });

  it("keeps a pointer outside the window outside 0-1", () => {
    const { f, space, reg } = windowTake({ x: 100, y: 50, width: 400, height: 300 });
    const tracker = reg.start("s", space);
    tracker.setAnchor(0, "exact");
    f.move(50, 0); // 50 pt left of and 50 pt above the window
    f.tick(16);
    const track = reg.finish("s", false)!;
    expect(track.x[0]).toBeCloseTo(-0.25, 6);
    expect(track.y[0]).toBeCloseTo(-0.1667, 3);
  });

  it("uses the aspect-fit: a wide window leaves the bottom of the output unused", () => {
    // 800x300 window into 800x600: scale 1, content 800x300 at the top-left.
    const { f, space, reg } = windowTake({ x: 0, y: 0, width: 800, height: 300 });
    const tracker = reg.start("s", space);
    tracker.setAnchor(0, "exact");
    f.move(800, 300); // the window's bottom-right corner
    f.tick(16);
    const track = reg.finish("s", false)!;
    expect(track.x[0]).toBeCloseTo(1, 6);
    expect(track.y[0]).toBeCloseTo(0.5, 6);
  });

  it("normalizes each sample against the geometry in force at its own time (move + resize)", () => {
    const { f, log, space, reg } = windowTake({ x: 100, y: 50, width: 400, height: 300 });
    const tracker = reg.start("s", space);
    tracker.setAnchor(0, "exact");
    // The pointer never moves: (300, 200), the window centre at first.
    f.move(300, 200);
    f.tick(40);
    log.push(geo(40, { x: 200, y: 50, width: 400, height: 300 })); // the window moves right
    f.tick(40);
    log.push(geo(80, { x: 100, y: 50, width: 800, height: 300 })); // resize to 800x300, scale 1
    f.tick(40);
    const track = reg.finish("s", false)!;
    const xAt = (t: number) => track.x[track.t.indexOf(t)];
    const yAt = (t: number) => track.y[track.t.indexOf(t)];
    // Earlier samples do not move when the geometry changes later.
    expect(xAt(0)).toBeCloseTo(0.5, 6);
    expect(yAt(0)).toBeCloseTo(0.5, 6);
    // After the move: x = (300 - 200) * 2 / 800 = 0.25.
    expect(xAt(40)).toBeCloseTo(0.25, 6);
    expect(yAt(40)).toBeCloseTo(0.5, 6);
    // After the resize: x = (300 - 100) * 1 / 800 = 0.25, y = (200 - 50) / 600 = 0.25.
    expect(xAt(80)).toBeCloseTo(0.25, 6);
    expect(yAt(80)).toBeCloseTo(0.25, 6);
  });

  it("a click during a resize lands on the geometry in force at the click", () => {
    const { f, log, space, reg } = windowTake({ x: 100, y: 50, width: 400, height: 300 });
    const tracker = reg.start("s", space);
    tracker.setAnchor(0, "exact");
    f.move(300, 200);
    f.tick(20);
    tracker.addClick(0); // centre of the original window
    log.push(geo(24, { x: 100, y: 50, width: 800, height: 300 }));
    f.tick(10);
    tracker.addClick(0); // same pointer, new geometry
    const track = reg.finish("s", true)!;
    expect(track.clicks).toHaveLength(2);
    expect(track.clicks[0].x).toBeCloseTo(0.5, 6);
    expect(track.clicks[0].y).toBeCloseTo(0.5, 6);
    expect(track.clicks[1].x).toBeCloseTo(0.25, 6);
    expect(track.clicks[1].y).toBeCloseTo(0.25, 6);
  });

  it("drops samples and clicks taken before the first geometry", () => {
    const f = fakeDeps();
    const log = new WindowGeometryLog();
    log.setOutput(OUT);
    log.push(geo(50, { x: 0, y: 0, width: 400, height: 300 }));
    const space = windowCapturedSpace("window:42:0", 1, log)!;
    const reg = new CursorTrackRegistry(f.deps);
    const tracker = reg.start("s", space);
    tracker.setAnchor(0, "exact");
    f.move(200, 150);
    f.tick(40);
    tracker.addClick(0); // t = 40, still before the geometry at 50
    f.tick(60);
    const track = reg.finish("s", true)!;
    expect(Math.min(...track.t)).toBeGreaterThanOrEqual(50);
    expect(track.clicks).toHaveLength(0);
    expect(track.x.every((v) => Math.abs(v - 0.5) < 1e-9)).toBe(true);
  });

  it("builds nothing while the output size is unknown", () => {
    const f = fakeDeps();
    const log = new WindowGeometryLog();
    log.push(geo(0, { x: 0, y: 0, width: 400, height: 300 }));
    const space = windowCapturedSpace("window:42:0", 1, log)!;
    const reg = new CursorTrackRegistry(f.deps);
    const tracker = reg.start("s", space);
    tracker.setAnchor(0, "exact");
    f.tick(40);
    expect(reg.finish("s", false)).toBeNull();
  });

  it("maps a window on a secondary display with a negative origin", () => {
    // Left of and above the primary display: x and y are negative in global points.
    const { f, space, reg } = windowTake({ x: -1600, y: -300, width: 400, height: 300 }, 1);
    const tracker = reg.start("s", space);
    tracker.setAnchor(0, "exact");
    f.move(-1600, -300);
    f.tick(16);
    f.move(-1400, -150);
    f.tick(16);
    f.move(-1200, 0); // bottom-right corner
    f.tick(16);
    const track = reg.finish("s", false)!;
    expect(track.x.map((v) => Number(v.toFixed(6)))).toContain(0);
    expect(track.x.map((v) => Number(v.toFixed(6)))).toContain(0.5);
    expect(track.x.map((v) => Number(v.toFixed(6)))).toContain(1);
    expect(track.y.map((v) => Number(v.toFixed(6)))).toContain(0.5);
    expect(track.y.map((v) => Number(v.toFixed(6)))).toContain(1);
  });

  it("stores the window as the display: id, output in points, scale, no region", () => {
    const { f, space, reg } = windowTake({ x: 0, y: 0, width: 400, height: 300 }, 2);
    const tracker = reg.start("s", space);
    tracker.setAnchor(0, "exact");
    f.move(10, 10);
    f.tick(16);
    const track = reg.finish("s", false)!;
    expect(track.version).toBe(1);
    expect(track.display).toEqual({ id: "window:42", width: 400, height: 300, scaleFactor: 2 });
    expect(track.region).toBeUndefined();
  });
});

describe("display and area takes are untouched", () => {
  const DISPLAY: CapturedDisplay = {
    id: "7",
    bounds: { x: 1000, y: 0, width: 1000, height: 500 },
    scaleFactor: 2,
  };
  const run = (display: CapturedDisplay) => {
    const f = fakeDeps();
    const reg = new CursorTrackRegistry(f.deps);
    const tracker = reg.start("s", display);
    tracker.setAnchor(0, "exact");
    f.move(1500, 250);
    f.tick(24);
    tracker.addClick(0);
    f.move(1100, 120);
    f.tick(24);
    return serializeCursorTrack(reg.finish("s", true)!);
  };

  it("a display take serializes to the exact bytes it did before", () => {
    // Golden bytes captured from the tracker before the window change was written.
    expect(run(DISPLAY)).toBe(
      '{"version":1,"display":{"id":"7","width":1000,"height":500,"scaleFactor":2},"anchor":"exact","clicksAvailable":true,"t":[0,8,24,32,48],"x":[-1,0.5,0.5,0.1,0.1],"y":[0,0.5,0.5,0.24,0.24],"clicks":[{"t":24,"x":0.5,"y":0.5,"button":0}]}',
    );
  });

  it("an area take serializes to the exact bytes it did before", () => {
    expect(
      run({
        id: "7",
        bounds: { x: 1100, y: 100, width: 400, height: 200 },
        scaleFactor: 2,
        region: { displayId: "7", x: 100, y: 100 },
      }),
    ).toBe(
      '{"version":1,"display":{"id":"7","width":400,"height":200,"scaleFactor":2},"anchor":"exact","clicksAvailable":true,"t":[0,8,24,32,48],"x":[-2.75,1,1,0,0],"y":[-0.5,0.75,0.75,0.1,0.1],"clicks":[{"t":24,"x":1,"y":0.75,"button":0}],"region":{"displayId":"7","x":100,"y":100}}',
    );
  });
});
