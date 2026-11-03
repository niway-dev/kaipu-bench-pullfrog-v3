import { describe, expect, it } from "vitest";
import { hitsCursor } from "./cursor-layer";
import type { CursorFrame } from "./cursor-model";

const arrow: CursorFrame = { x: 100, y: 100, size: 40, style: "arrow", bounce: 1, click: null };

describe("clicking the drawn pointer", () => {
  it("hits the arrow's body and its padding, and misses beside it", () => {
    expect(hitsCursor(arrow, 110, 120, 4)).toBe(true); // inside the body
    expect(hitsCursor(arrow, 97, 98, 4)).toBe(true); // just above-left of the tip
    expect(hitsCursor(arrow, 100 + 40 * 0.65 + 10, 120, 4)).toBe(false); // right of it
    expect(hitsCursor(arrow, 110, 150, 4)).toBe(false); // below it
  });

  it("uses a circle for the dot and the spotlight", () => {
    const dot = { ...arrow, style: "dot" as const };
    expect(hitsCursor(dot, 100 + 40 * 0.22 + 3, 100, 4)).toBe(true);
    expect(hitsCursor(dot, 100 + 40 * 0.22 + 5, 100, 4)).toBe(false);
    const spotlight = { ...arrow, style: "spotlight" as const };
    expect(hitsCursor(spotlight, 100 + 40 * 0.22 + 3, 100, 4)).toBe(true);
    expect(hitsCursor(spotlight, 145, 100, 4)).toBe(false); // inside the glow, off-centre
  });
});
