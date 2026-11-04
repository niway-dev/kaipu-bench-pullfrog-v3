import { describe, expect, it } from "vitest";
import { windowKindFromSearch } from "./window-kind";

describe("windowKindFromSearch", () => {
  it("maps ?mode=capture to the capture panel", () => {
    expect(windowKindFromSearch("?mode=capture")).toBe("capture-panel");
  });
  it("maps ?window=<kind> to that kind", () => {
    expect(windowKindFromSearch("?window=control-bar")).toBe("control-bar");
    expect(windowKindFromSearch("?window=capture-overlay&displayId=1")).toBe("capture-overlay");
  });
  it("is null for the full app and for unknown windows", () => {
    expect(windowKindFromSearch("")).toBeNull();
    expect(windowKindFromSearch("?window=nope")).toBeNull();
  });
});
