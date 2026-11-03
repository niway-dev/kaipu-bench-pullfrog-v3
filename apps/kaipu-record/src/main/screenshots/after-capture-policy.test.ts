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
});
