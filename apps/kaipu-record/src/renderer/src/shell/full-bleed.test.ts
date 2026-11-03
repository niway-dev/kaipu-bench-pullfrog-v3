import { describe, expect, it } from "vitest";
import { isFullBleedPath } from "./app-shell";

describe("isFullBleedPath", () => {
  it("is true for the video editor, on its current and legacy paths", () => {
    expect(isFullBleedPath("/editor/video/abc123")).toBe(true);
    expect(isFullBleedPath("/video-editor")).toBe(true);
  });

  it("keeps the page padding everywhere else, the image editor and Editor home included", () => {
    for (const path of ["/editor", "/editor/image/abc123", "/editor/new", "/library", "/"]) {
      expect(isFullBleedPath(path)).toBe(false);
    }
  });
});
