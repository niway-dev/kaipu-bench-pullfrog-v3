/**
 * Compares the two shots of one crop under `--twice`. Pure: it takes decoded RGBA buffers,
 * so it is tested with synthetic ones and never touches a file.
 */

/*
 * Render noise: the GPU rasterizes anti-aliased edges and gradients with a little jitter
 * between two launches of the same build on the same screen. A real change (a different
 * frame, a label, a meter) moves channels by tens, or touches many pixels. A diff is noise
 * when it fits ONE of three bands, each trading size for count:
 *
 * 1. Imperceptible: no channel moved by more than 2 of 255. A person cannot see it, so the
 *    number of pixels does not matter. Such pixels are also left out of the counts below.
 * 2. Small and rare: up to 8 per channel on at most 1% of the crop's pixels.
 * 3. Larger and rarer: up to 24 per channel on at most 0.5% of the pixels AND at most 2000
 *    pixels, so a big crop cannot hide a patch the size of a thumbnail. The first shots of
 *    this catalog showed rounded-border edges off by up to 17 on a few dozen pixels.
 *
 * Nothing is masked and nothing is rendered in software: the catalog only declines to call
 * these a difference. Tuning a band needs data from a full `--twice` run, recorded here.
 */
export const IMPERCEPTIBLE_MAX_DELTA = 2;
export const SMALL_NOISE_MAX_DELTA = 8;
export const SMALL_NOISE_MAX_FRACTION = 0.01;
export const SPARSE_NOISE_MAX_DELTA = 24;
export const SPARSE_NOISE_MAX_FRACTION = 0.005;
export const SPARSE_NOISE_MAX_PIXELS = 2000;

export interface Rgba {
  readonly width: number;
  readonly height: number;
  /** `width * height * 4` bytes, row-major. */
  readonly data: Uint8Array;
}

export interface BoundingBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export type CropComparison =
  | { readonly kind: "identical" }
  | { readonly kind: "noise"; readonly pixels: number; readonly maxDelta: number }
  | {
      readonly kind: "differs";
      readonly reason: "size";
      readonly first: string;
      readonly second: string;
    }
  | {
      readonly kind: "differs";
      readonly reason: "pixels";
      readonly pixels: number;
      readonly maxDelta: number;
      readonly box: BoundingBox;
    };

export function compareCrops(first: Rgba, second: Rgba): CropComparison {
  if (first.width !== second.width || first.height !== second.height) {
    return {
      kind: "differs",
      reason: "size",
      first: `${first.width}x${first.height}`,
      second: `${second.width}x${second.height}`,
    };
  }
  const { width, data: a } = first;
  const b = second.data;
  let pixels = 0;
  let maxDelta = 0;
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i + 3 < a.length; i += 4) {
    const delta = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
      Math.abs(a[i + 3] - b[i + 3]),
    );
    if (delta === 0) continue;
    pixels += 1;
    if (delta > maxDelta) maxDelta = delta;
    const p = i / 4;
    const x = p % width;
    const y = Math.floor(p / width);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (pixels === 0) return { kind: "identical" };
  // Pixels that moved by at most IMPERCEPTIBLE_MAX_DELTA are invisible and are not counted
  // against the bands: the first --twice data had 81 000 pixels of a Library grid off by 1
  // (thumbnail decode) next to 319 off by 2 to 7, and counting all of them as "moved by
  // up to 7" would call 20% of the crop a visible change.
  let visible = 0;
  let visibleMax = 0;
  for (let i = 0; i + 3 < a.length; i += 4) {
    const delta = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
      Math.abs(a[i + 3] - b[i + 3]),
    );
    if (delta <= IMPERCEPTIBLE_MAX_DELTA) continue;
    visible += 1;
    if (delta > visibleMax) visibleMax = delta;
  }
  const area = first.width * first.height;
  if (
    visible === 0 ||
    (visibleMax <= SMALL_NOISE_MAX_DELTA && visible <= area * SMALL_NOISE_MAX_FRACTION) ||
    (visibleMax <= SPARSE_NOISE_MAX_DELTA &&
      visible <= area * SPARSE_NOISE_MAX_FRACTION &&
      visible <= SPARSE_NOISE_MAX_PIXELS)
  ) {
    return { kind: "noise", pixels, maxDelta };
  }
  return { kind: "differs", reason: "pixels", pixels, maxDelta, box: { x0, y0, x1, y1 } };
}

/** One line of the `--twice` report for a crop that differs. */
export function describeDifference(comparison: CropComparison): string {
  if (comparison.kind !== "differs") return comparison.kind;
  if (comparison.reason === "size") return `size ${comparison.first} vs ${comparison.second}`;
  const { x0, y0, x1, y1 } = comparison.box;
  return `${comparison.pixels} px, max delta ${comparison.maxDelta}, box ${x0},${y0}-${x1},${y1}`;
}
