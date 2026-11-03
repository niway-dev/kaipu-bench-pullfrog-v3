import { describe, expect, it } from "vitest";
import { decideAfterCapture } from "./after-capture-policy";

describe("decideAfterCapture", () => {
  it.each([
    ["copy", "auto", { open: "quiet", copy: true }],
    ["copy", "manual", { open: "quiet", copy: true }],
    ["capture", "auto", { open: "quiet", copy: true }],
    ["capture", "manual", { open: "quiet", copy: false }],
  ] as const)("%s, copy %s", (action, copy, expected) => {
    expect(decideAfterCapture(action, copy)).toEqual(expected);
  });
  it.each(["auto", "manual"] as const)(
    "explicit Copy overrides the editor preference (%s)",
    (copy) => {
      expect(decideAfterCapture("copy", copy, "editor")).toEqual({ open: "quiet", copy: true });
    },
  );
  it("opens Capture in the editor only when configured", () => {
    expect(decideAfterCapture("capture", "manual", "editor")).toEqual({
      open: "editor",
      copy: false,
    });
    expect(decideAfterCapture("capture", "auto", "editor")).toEqual({ open: "editor", copy: true });
  });
});
