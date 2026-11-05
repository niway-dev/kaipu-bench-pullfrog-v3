import { describe, expect, it } from "vitest";
import { WindowGeometryLog } from "./window-geometry-log";

const rect = (x: number, w = 400) => ({ x, y: 50, width: w, height: 300 });
const content = { x: 0, y: 0, width: 800, height: 600 };

describe("WindowGeometryLog", () => {
  it("has no geometry before the first push", () => {
    const log = new WindowGeometryLog();
    expect(log.latest()).toBeNull();
    expect(log.at(1000)).toBeNull();
    expect(log.output()).toBeNull();
  });

  it("returns the geometry in force at a time, never a later one", () => {
    const log = new WindowGeometryLog();
    log.push({ atMs: 100, frame: rect(10), content });
    log.push({ atMs: 200, frame: rect(20), content });
    log.push({ atMs: 300, frame: rect(30), content });
    expect(log.at(99)).toBeNull(); // before the first geometry
    expect(log.at(100)?.frame.x).toBe(10);
    expect(log.at(199)?.frame.x).toBe(10);
    expect(log.at(200)?.frame.x).toBe(20);
    expect(log.at(10_000)?.frame.x).toBe(30);
    expect(log.latest()?.frame.x).toBe(30);
  });

  it("keeps time order when a frame arrives out of order", () => {
    const log = new WindowGeometryLog();
    log.push({ atMs: 300, frame: rect(30), content });
    log.push({ atMs: 100, frame: rect(10), content });
    expect(log.at(150)?.frame.x).toBe(10);
    expect(log.at(350)?.frame.x).toBe(30);
  });

  it("ignores a repeat of the geometry already in force", () => {
    const log = new WindowGeometryLog();
    log.push({ atMs: 100, frame: rect(10), content });
    log.push({ atMs: 150, frame: rect(10), content });
    expect(log.size).toBe(1);
  });

  it("drops a late duplicate of the geometry that follows it, too (S4)", () => {
    const log = new WindowGeometryLog();
    log.push({ atMs: 100, frame: rect(10), content });
    log.push({ atMs: 300, frame: rect(30), content });
    log.push({ atMs: 200, frame: rect(30), content }); // arrives late, same as what follows
    expect(log.size).toBe(2);
    expect(log.at(250)?.frame.x).toBe(30);
    expect(log.at(150)?.frame.x).toBe(10);
  });

  it("lists the geometry changes strictly between two times", () => {
    const log = new WindowGeometryLog();
    for (const [at, x] of [
      [100, 10],
      [200, 20],
      [300, 30],
    ])
      log.push({ atMs: at, frame: rect(x), content });
    expect(log.between(100, 300).map((g) => g.atMs)).toEqual([200]);
    expect(log.between(0, 1000).map((g) => g.atMs)).toEqual([100, 200, 300]);
    expect(log.between(300, 400)).toEqual([]);
  });

  it("holds the display scale once learned, and can be reset for a new session", () => {
    const log = new WindowGeometryLog();
    expect(log.scaleFactor()).toBeNull();
    log.setScaleFactor(2);
    log.setOutput({ width: 4, height: 4 });
    log.push({ atMs: 1, frame: rect(1), content });
    expect(log.scaleFactor()).toBe(2);
    log.reset();
    expect(log.scaleFactor()).toBeNull();
    expect(log.output()).toBeNull();
    expect(log.latest()).toBeNull();
  });

  it("holds the output size once config is known", () => {
    const log = new WindowGeometryLog();
    log.setOutput({ width: 800, height: 600 });
    expect(log.output()).toEqual({ width: 800, height: 600 });
  });
});
