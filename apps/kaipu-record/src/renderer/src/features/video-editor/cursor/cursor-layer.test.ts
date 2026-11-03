// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { hitsCursor, pressReachesBackground } from "./cursor-layer";
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
    expect(hitsCursor({ ...arrow, style: "spotlight" }, 145, 100, 4)).toBe(true);
  });

  it("only claims presses on the footage, never on a control laid over it", () => {
    const stage = document.createElement("div");
    stage.innerHTML = `
      <div id="content">
        <video id="video"></video>
        <div id="layer">
          <svg id="svg"><rect id="shape" /></svg>
          <textarea id="text"></textarea>
        </div>
      </div>
      <canvas></canvas>
      <div id="camera-box"></div>`;
    const content = stage.querySelector("#content");
    const at = (id: string) => pressReachesBackground(stage.querySelector(`#${id}`), content);
    expect(at("video")).toBe(true);
    expect(at("layer")).toBe(true);
    expect(at("svg")).toBe(true); // empty annotation canvas
    expect(at("shape")).toBe(false); // an annotation
    expect(at("text")).toBe(false); // a text being edited
    expect(at("camera-box")).toBe(false); // chrome outside the content
    expect(pressReachesBackground(null, content)).toBe(false);
  });
});
