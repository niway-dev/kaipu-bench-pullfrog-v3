import { describe, expect, it } from "vitest";
import { serializeCursorTrack } from "@shared/cursor-track";
import {
  type CapturedDisplay,
  CursorTrackRegistry,
  type CursorTrackerDeps,
} from "./cursor-tracker";

// Golden bytes of display and area takes. This file imports nothing the window work added,
// so it also runs unchanged against the code before NIW2-645 (see the PR's golden proof).

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
