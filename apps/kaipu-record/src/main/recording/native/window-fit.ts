/**
 * Pure mirror of `emitGeometry` in `native/encoded-capture/main.swift` (keep them in step).
 *
 * With `scalesToFit`, ScreenCaptureKit scales the window uniformly, up or down, until one
 * axis fills the fixed output, and pins it to the top-left; the rest is transparent. So the
 * content rect follows from the window's per-frame `screenRect` size and the output size
 * alone, with no dependence on the backing scale or the display. Spike W0 row 7 measured
 * 580x385 into 580x384 as 578.49x384. The frame's own `contentRect` is only logged as a
 * cross-check.
 */
export function windowContentRect(
  window: { width: number; height: number },
  output: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(output.width / window.width, output.height / window.height);
  return { x: 0, y: 0, width: window.width * scale, height: window.height * scale };
}
