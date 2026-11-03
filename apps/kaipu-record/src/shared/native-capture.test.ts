import { expect, it } from "vitest";
import { canOverlayRecordedCursor } from "./native-capture";
import { buildRecordingCapture, sanitizeRecordingCapture } from "./recording-capture";
it("persists explicit provenance and fails closed for legacy/imported/unknown cursor pixels", () => {
  const capture = buildRecordingCapture({ sourceId: "screen:1:0" });
  expect(sanitizeRecordingCapture(capture)?.cursorPixels).toBe("embedded");
  expect(canOverlayRecordedCursor(capture)).toBe(false);
  const excluded = sanitizeRecordingCapture({ ...capture, cursorPixels: "excluded" });
  expect(excluded?.cursorPixels).toBe("excluded");
  expect(canOverlayRecordedCursor(excluded)).toBe(true);
  for (const value of [
    null,
    { ...capture, cursorPixels: undefined },
    { ...capture, cursorPixels: "unknown" },
  ]) {
    expect(canOverlayRecordedCursor(sanitizeRecordingCapture(value))).toBe(false);
  }
});
