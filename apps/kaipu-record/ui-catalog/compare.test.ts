import { describe, expect, it } from "vitest";
import {
  compareCrops,
  describeDifference,
  IMPERCEPTIBLE_MAX_DELTA,
  SMALL_NOISE_MAX_DELTA,
  SPARSE_NOISE_MAX_DELTA,
  SPECKLE_MAX_PIXELS,
  type Rgba,
} from "./compare";

function image(width: number, height: number, fill = 100): Rgba {
  return { width, height, data: new Uint8Array(width * height * 4).fill(fill) };
}

function withPixel(base: Rgba, x: number, y: number, rgb: [number, number, number]): Rgba {
  const data = base.data.slice();
  data.set(rgb, (y * base.width + x) * 4);
  return { ...base, data };
}

describe("compareCrops", () => {
  it("reports identical buffers", () => {
    expect(compareCrops(image(4, 3), image(4, 3))).toEqual({ kind: "identical" });
  });

  it("calls a diff of at most 2 per channel noise however many pixels moved", () => {
    const a = image(10, 10);
    const b = { ...a, data: a.data.map((v) => v + IMPERCEPTIBLE_MAX_DELTA) };
    expect(compareCrops(a, b)).toEqual({
      kind: "noise",
      pixels: 100,
      maxDelta: IMPERCEPTIBLE_MAX_DELTA,
    });
  });

  it("calls a few moves of up to 8 render noise", () => {
    const a = image(100, 100);
    const b = withPixel(withPixel(a, 0, 0, [101, 100, 100]), 3, 2, [
      100,
      100,
      100 + SMALL_NOISE_MAX_DELTA,
    ]);
    expect(compareCrops(a, b)).toEqual({
      kind: "noise",
      pixels: 2,
      maxDelta: SMALL_NOISE_MAX_DELTA,
    });
  });

  it("does not forgive a move of 8 once it spreads over more than 1% of the crop", () => {
    const a = image(100, 100);
    let b = a;
    for (let x = 0; x < 101; x++) {
      b = withPixel(b, x % 100, Math.floor(x / 100), [100 + SMALL_NOISE_MAX_DELTA, 100, 100]);
    }
    expect(compareCrops(a, b)).toMatchObject({ kind: "differs", pixels: 101 });
  });

  it("reports a pixel one step past 8 in a tiny crop as a difference with its box", () => {
    const a = image(5, 4);
    const b = withPixel(
      withPixel(a, 1, 1, [100 + SMALL_NOISE_MAX_DELTA + 1, 100, 100]),
      3,
      2,
      [100, 90, 100],
    );
    expect(compareCrops(a, b)).toEqual({
      kind: "differs",
      reason: "pixels",
      pixels: 2,
      maxDelta: 10,
      box: { x0: 1, y0: 1, x1: 3, y1: 2 },
    });
  });

  it("forgives a few isolated pixels that moved up to the sparse limit", () => {
    const a = image(100, 100);
    const b = withPixel(a, 5, 5, [100 + SPARSE_NOISE_MAX_DELTA, 100, 100]);
    expect(compareCrops(a, b)).toMatchObject({ kind: "noise", pixels: 1 });
  });

  it("does not count pixels that moved by at most 2 against the bands", () => {
    const a = image(100, 100);
    const data = a.data.map((v) => v + 1);
    data.set([100 + SMALL_NOISE_MAX_DELTA, 100, 100, 100], 0);
    expect(compareCrops(a, { ...a, data })).toMatchObject({ kind: "noise", maxDelta: 8 });
  });

  it("does not forgive that same move once it spreads over more than 0.5% of the crop", () => {
    const a = image(100, 100);
    let b = a;
    for (let x = 0; x < 51; x++) b = withPixel(b, x, 0, [100 + SPARSE_NOISE_MAX_DELTA, 100, 100]);
    expect(compareCrops(a, b)).toMatchObject({ kind: "differs", pixels: 51 });
  });

  it("does not forgive more than 2000 pixels even inside 0.5% of a huge crop", () => {
    const a = image(1000, 1000);
    const data = a.data.slice();
    for (let p = 0; p < 2001; p++) data[p * 4] = 100 + SPARSE_NOISE_MAX_DELTA;
    expect(compareCrops(a, { ...a, data })).toMatchObject({ kind: "differs", pixels: 2001 });
  });

  it("forgives edge speckle: a few pixels by any amount in a large crop", () => {
    const a = image(100, 100);
    let b = a;
    for (let x = 0; x < SPECKLE_MAX_PIXELS; x++) b = withPixel(b, x, 0, [200, 100, 100]);
    expect(compareCrops(a, b)).toMatchObject({ kind: "noise", pixels: SPECKLE_MAX_PIXELS });
  });

  it("does not forgive one pixel more than the speckle limit past the sparse limit", () => {
    const a = image(100, 100);
    let b = a;
    for (let x = 0; x <= SPECKLE_MAX_PIXELS; x++) b = withPixel(b, x, 0, [200, 100, 100]);
    expect(compareCrops(a, b)).toMatchObject({ kind: "differs", pixels: SPECKLE_MAX_PIXELS + 1 });
  });

  it("counts a large change that touches one channel", () => {
    const a = image(2, 2);
    expect(compareCrops(a, withPixel(a, 1, 0, [100, 100, 200]))).toMatchObject({
      kind: "differs",
      maxDelta: 100,
      pixels: 1,
    });
  });

  it("reports different sizes without comparing pixels", () => {
    expect(compareCrops(image(4, 3), image(4, 2))).toEqual({
      kind: "differs",
      reason: "size",
      first: "4x3",
      second: "4x2",
    });
  });

  it("describes a difference in one line", () => {
    const a = image(5, 4);
    expect(describeDifference(compareCrops(a, withPixel(a, 2, 3, [200, 100, 100])))).toBe(
      "1 px, max delta 100, box 2,3-2,3",
    );
  });
});
