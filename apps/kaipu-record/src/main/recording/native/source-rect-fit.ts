/**
 * Pure mirror of the size guards in `native/encoded-capture/main.swift` (keep them in
 * step). Whole display (`cropped: false`): the original rules, unchanged (aspect ratio
 * within 0.01, no side above the native size). Cropped: `fitToCap` rounds each side to
 * the nearest even number, so an output can differ from the exact scaled rect by up to
 * 1 px per side; the helper allows 2 px, and checks the aspect on the axis whose error
 * stays small (max 1 + 1/r <= 2). Pinned against `areaEncodePlan` in the test.
 */
export function sourceRectFit(input: {
  outW: number;
  outH: number;
  rectW: number;
  rectH: number;
  scale: number;
  cropped?: boolean;
}): "ok" | "aspect" | "upscale" {
  const nativeW = input.rectW * input.scale;
  const nativeH = input.rectH * input.scale;
  const r = nativeW / nativeH;
  if (input.cropped === false) {
    if (Math.abs(input.outW / input.outH - r) >= 0.01) return "aspect";
    if (input.outW > nativeW || input.outH > nativeH) return "upscale";
    return "ok";
  }
  const aspectError =
    r >= 1 ? Math.abs(input.outH - input.outW / r) : Math.abs(input.outW - input.outH * r);
  if (aspectError > 2) return "aspect";
  if (input.outW > nativeW + 2 || input.outH > nativeH + 2) return "upscale";
  return "ok";
}
