import { describe, expect, it } from "vitest";
import type { SourceThumbnail } from "../use-source-thumbnails";
import {
  fractionToTime,
  formatScrubTime,
  rulerMinorTicks,
  rulerTicks,
  thumbnailsForRange,
  thumbnailsForRangeWithin,
  timeToFraction,
} from "./timeline-geometry";

describe("time/fraction mapping", () => {
  it("maps and clamps", () => {
    expect(timeToFraction(5, 10)).toBe(0.5);
    expect(timeToFraction(-1, 10)).toBe(0);
    expect(timeToFraction(15, 10)).toBe(1);
    expect(timeToFraction(0, 0)).toBe(0); // zero-duration guard
    expect(fractionToTime(0.25, 60)).toBe(15);
  });
});

describe("rulerTicks", () => {
  it("picks a nice interval and includes 0", () => {
    const ticks = rulerTicks(90);
    expect(ticks[0]).toEqual({ time: 0, label: "0:00" });
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks.length).toBeLessThanOrEqual(11);
    expect(ticks.at(-1)!.time).toBeLessThanOrEqual(90);
  });

  it.each([10.5, 15, 101])(
    "keeps a reasonable tick count for short/edge durations (%s)",
    (duration) => {
      const ticks = rulerTicks(duration);
      expect(ticks.length).toBeGreaterThanOrEqual(5);
      expect(ticks.length).toBeLessThanOrEqual(11);
    },
  );
});

describe("rulerMinorTicks", () => {
  it("fills each labelled step with evenly spaced unlabelled ticks", () => {
    // 6 s → labelled every 1 s, minor every 0.25 s.
    const minor = rulerMinorTicks(6);
    expect(minor.slice(0, 4)).toEqual([0.25, 0.5, 0.75, 1.25]);
    expect(minor).toHaveLength(6 * 3);
  });

  it("never lands on a labelled tick", () => {
    for (const duration of [6, 29, 90, 601]) {
      const labelled = new Set(rulerTicks(duration).map((tick) => tick.time));
      for (const time of rulerMinorTicks(duration)) expect(labelled.has(time)).toBe(false);
    }
  });

  it("stays inside the duration", () => {
    expect(Math.max(...rulerMinorTicks(29))).toBeLessThanOrEqual(29);
  });
});

describe("formatScrubTime", () => {
  it.each([
    [0, "0:00.0"],
    [7.46, "0:07.4"],
    [65.99, "1:05.9"],
    [-1, "0:00.0"],
  ])("%s s → %s", (seconds, label) => {
    expect(formatScrubTime(seconds)).toBe(label);
  });
});

describe("thumbnailsForRange", () => {
  const thumbs = Array.from({ length: 10 }, (_, i) => ({
    sourceTime: i * 10 + 5, // 5, 15, ... 95
    url: `u${i}`,
  }));

  it("picks nearest thumbnails evenly across the source range", () => {
    const picked = thumbnailsForRange(thumbs, 20, 60, 4);
    expect(picked).toHaveLength(4);
    expect(picked[0].sourceTime).toBeGreaterThanOrEqual(15);
    expect(picked.at(-1)!.sourceTime).toBeLessThanOrEqual(65);
  });

  it("returns [] when there are no thumbnails", () => {
    expect(thumbnailsForRange([], 0, 10, 4)).toEqual([]);
  });
});

describe("thumbnailsForRangeWithin", () => {
  // A long recording (240 s) has one thumbnail every 10 s of source: 5, 15, ... 235.
  const thumbs = Array.from({ length: 24 }, (_, i) => ({ sourceTime: 5 + i * 10, url: `c${i}` }));
  const urls = (picked: (SourceThumbnail | null)[]) => picked.map((t) => t?.url ?? null);

  it("leaves a tile empty before a late start shorter than one thumbnail spacing", () => {
    // The webcam starts 3 s in: the tile at source 1 s has a frame 4 s away, but no footage.
    const picked = thumbnailsForRangeWithin(thumbs, 0, 10, 5, { start: 3, end: 240 });
    expect(urls(picked)).toEqual([null, "c0", "c0", "c0", "c0"]);
  });

  it("leaves a tile empty after an early end shorter than one thumbnail spacing", () => {
    // The webcam ends 4 s before the screen: the tile at 239 s must not show the last face.
    const picked = thumbnailsForRangeWithin(thumbs, 230, 240, 5, { start: 0, end: 236 });
    expect(urls(picked)).toEqual(["c23", "c23", "c23", null, null]);
  });

  it("returns [] when there are no thumbnails", () => {
    expect(thumbnailsForRangeWithin([], 0, 10, 4, { start: 0, end: 10 })).toEqual([]);
  });
});
