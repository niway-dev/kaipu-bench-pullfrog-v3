import { expect, it } from "vitest";
import { windowContentRect } from "./window-fit";

const out = { width: 580, height: 384 };

it("matches the spike's measured example (580x385 window, 580x384 output)", () => {
  const c = windowContentRect({ width: 580, height: 385 }, out);
  expect(c.x).toBe(0);
  expect(c.y).toBe(0);
  expect(c.width).toBeCloseTo(578.49, 2);
  expect(c.height).toBeCloseTo(384, 6);
});

it("fits a landscape window into a taller output: full width, top aligned", () => {
  const c = windowContentRect({ width: 800, height: 400 }, { width: 640, height: 480 });
  expect(c).toEqual({ x: 0, y: 0, width: 640, height: 320 });
});

it("fits a portrait window: full height, left aligned", () => {
  const c = windowContentRect({ width: 300, height: 600 }, { width: 640, height: 480 });
  expect(c).toEqual({ x: 0, y: 0, width: 240, height: 480 });
});

it("scales a window larger than the output down", () => {
  const c = windowContentRect({ width: 3000, height: 2000 }, out);
  expect(c.height).toBeCloseTo(384, 6);
  expect(c.width).toBeCloseTo(576, 6);
});

it("scales a tiny window up (scalesToFit fills one axis)", () => {
  const c = windowContentRect({ width: 66, height: 20 }, out);
  expect(c.width).toBeCloseTo(580, 6);
  expect(c.height).toBeCloseTo((20 * 580) / 66, 6);
  expect(c.height).toBeLessThanOrEqual(384);
});

it("never exceeds the output and keeps the window's aspect", () => {
  for (const [w, h] of [
    [1, 1],
    [1000, 1],
    [1, 1000],
    [1440, 900],
    [797, 497],
  ]) {
    const c = windowContentRect({ width: w, height: h }, out);
    expect(c.width).toBeLessThanOrEqual(out.width + 1e-9);
    expect(c.height).toBeLessThanOrEqual(out.height + 1e-9);
    expect(c.width / c.height).toBeCloseTo(w / h, 6);
  }
});
