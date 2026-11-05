import { expect, it } from "vitest";
import type { NativeCaptureFrame } from "./native-capture";
import { NativeSequence } from "./native-capture-sequence";

const AVCC = Uint8Array.from([1, 100, 0, 31, 255, 225, 0, 1, 103, 1, 0, 1, 104]);
const AU = Uint8Array.from([0, 0, 0, 1, 5]);
const config = (): NativeCaptureFrame => ({
  header: {
    kind: "config",
    version: 1,
    codec: "avc1.64001f",
    width: 320,
    height: 180,
    epochUs: 1,
    cursorPixels: "excluded",
  },
  payload: AVCC,
});
const packet = (ptsUs: number, durationUs: number): NativeCaptureFrame => ({
  header: { kind: "packet", ptsUs, durationUs, keyframe: ptsUs === 0 },
  payload: AU,
});
const end = (endUs: number): NativeCaptureFrame => ({
  header: { kind: "end", endUs },
  payload: new Uint8Array(0),
});
const geometry = (overrides: Record<string, unknown> = {}): NativeCaptureFrame =>
  ({
    header: {
      kind: "geometry",
      atUs: 10,
      frame: { x: -1440, y: 120.5, width: 800, height: 600 },
      content: { x: 0, y: 0, width: 240, height: 180 },
      ...overrides,
    },
    payload: new Uint8Array(0),
  }) as NativeCaptureFrame;

it("accepts a geometry frame before config and between packets", () => {
  const sequence = new NativeSequence();
  sequence.accept(geometry());
  sequence.accept(config());
  sequence.accept(geometry({ atUs: 20 }));
  sequence.accept(packet(0, 100_000));
  sequence.accept(geometry({ atUs: 30 }));
  sequence.accept(packet(100_000, 100_000));
  sequence.accept(end(200_000));
  expect(() => sequence.finish()).not.toThrow();
});

it("refuses a geometry frame after end", () => {
  const sequence = new NativeSequence();
  sequence.accept(config());
  sequence.accept(packet(0, 100_000));
  sequence.accept(end(100_000));
  expect(() => sequence.accept(geometry())).toThrow("Invalid native sequence");
});

it("refuses a malformed geometry frame", () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 };
  const bad: Record<string, unknown>[] = [
    { atUs: -1 },
    { atUs: 1.5 },
    { frame: { ...rect, width: 0 } },
    { frame: { ...rect, height: -3 } },
    { frame: { ...rect, x: Number.NaN } },
    { frame: { ...rect, y: Infinity } },
    { frame: { x: 0, y: 0, width: 10 } },
    { frame: { ...rect, extra: 1 } },
    { frame: null },
    { content: { ...rect, x: -1 } },
    { content: { ...rect, width: 0 } },
    { content: { ...rect, height: Number.NaN } },
    { content: undefined },
  ];
  for (const overrides of bad)
    expect(() => new NativeSequence().accept(geometry(overrides))).toThrow(
      "Invalid native geometry",
    );
  const withPayload = geometry();
  withPayload.payload = Uint8Array.from([1]);
  expect(() => new NativeSequence().accept(withPayload)).toThrow("Invalid native geometry");
});
