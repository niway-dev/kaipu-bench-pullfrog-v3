import { describe, expect, it } from "vitest";
import { displayScaleAt, type DisplayLike, windowCapturedSpace } from "./captured-display";
import { WindowGeometryLog } from "./window-geometry-log";

const content = { x: 0, y: 0, width: 800, height: 600 };

describe("windowCapturedSpace", () => {
  it("is null for a source that is not a window", () => {
    const log = new WindowGeometryLog();
    log.push({ atMs: 0, frame: { x: 0, y: 0, width: 400, height: 300 }, content });
    expect(windowCapturedSpace("screen:1:0", 2, log)).toBeNull();
    expect(windowCapturedSpace("window:abc:0", 2, log)).toBeNull();
  });

  it("is null until a geometry is known", () => {
    expect(windowCapturedSpace("window:42:0", 2, new WindowGeometryLog())).toBeNull();
  });

  it("names the window and carries the log", () => {
    const log = new WindowGeometryLog();
    log.push({ atMs: 0, frame: { x: -300, y: 20, width: 400, height: 300 }, content });
    const space = windowCapturedSpace("window:42:0", 2, log);
    expect(space?.id).toBe("window:42");
    expect(space?.scaleFactor).toBe(2);
    expect(space?.window).toBe(log);
    expect(space?.region).toBeUndefined();
  });
});

describe("displayScaleAt", () => {
  const A: DisplayLike = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1512, height: 982 },
    scaleFactor: 2,
  };
  const B: DisplayLike = {
    id: 2,
    bounds: { x: -2560, y: -200, width: 2560, height: 1440 },
    scaleFactor: 1,
  };
  it("uses the display holding the point, including a negative origin", () => {
    expect(displayScaleAt({ x: -1000, y: 100 }, [A, B])).toBe(1);
    expect(displayScaleAt({ x: 100, y: 100 }, [A, B])).toBe(2);
  });
  it("falls back to the first display, then to 1", () => {
    expect(displayScaleAt({ x: 99999, y: 0 }, [A, B])).toBe(2);
    expect(displayScaleAt({ x: 0, y: 0 }, [])).toBe(1);
  });
});
