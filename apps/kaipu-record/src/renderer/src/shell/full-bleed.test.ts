import { describe, expect, it } from "vitest";
import { isFullBleedPath } from "./app-shell";

describe("isFullBleedPath", () => {
  it("is true for the video editor", () => {
    expect(isFullBleedPath("/editor/video/abc123")).toBe(true);
  });

  it("keeps the page padding everywhere else, the image editor and Editor home included", () => {
    for (const path of ["/editor", "/editor/image/abc123", "/editor/new", "/library", "/"]) {
      expect(isFullBleedPath(path)).toBe(false);
    }
  });
});
