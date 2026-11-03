import { describe, expect, it } from "vitest";
import { decodeNativeFrames } from "./framing";
import { NativeSequence } from "../../../shared/native-capture-sequence";
import { MAX_NATIVE_PAYLOAD, type NativeCaptureFrame } from "../../../shared/native-capture";

export const config: NativeCaptureFrame = {
  header: {
    kind: "config",
    cursorPixels: "excluded",
    version: 1,
    codec: "avc1.64001f",
    width: 640,
    height: 360,
    epochUs: 123456789,
  },
  payload: new Uint8Array([1, 100, 0, 31, 255, 225, 0, 1, 103, 1, 0, 1, 104]),
};
export const packet = (ptsUs = 0, durationUs = 33333, keyframe = true): NativeCaptureFrame => ({
  header: { kind: "packet", ptsUs, durationUs, keyframe },
  payload: new Uint8Array([0, 0, 0, 1, 5]),
});
export function encode(frame: NativeCaptureFrame): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify(frame.header));
  const result = new Uint8Array(8 + header.length + frame.payload.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, header.length);
  view.setUint32(4, frame.payload.length);
  result.set(header, 8);
  result.set(frame.payload, 8 + header.length);
  return result;
}
async function* pieces(bytes: Uint8Array) {
  for (const byte of bytes) yield new Uint8Array([byte]);
}
async function collect(bytes: Uint8Array) {
  return Array.fromAsync(decodeNativeFrames(pieces(bytes)));
}

describe("native live framing", () => {
  it("handles arbitrary fragmentation without reading ahead across yielded frames", async () => {
    let pulls = 0;
    async function* chunks() {
      pulls++;
      yield encode(config);
      pulls++;
      yield encode(packet());
    }
    const frames = decodeNativeFrames(chunks());
    expect((await frames.next()).value).toEqual(config);
    expect(pulls).toBe(1);
    expect((await frames.next()).value).toEqual(packet());
    expect(pulls).toBe(2);
    await frames.return(undefined);
    expect(await collect(encode(config))).toEqual([config]);
  });
  it("rejects truncated prefix/header/payload and oversize before reading body", async () => {
    const bytes = encode(packet());
    for (const size of [1, 7, 9, bytes.length - 1])
      await expect(collect(bytes.slice(0, size))).rejects.toThrow("Truncated");
    const prefix = new Uint8Array(8);
    const view = new DataView(prefix.buffer);
    view.setUint32(0, 1);
    view.setUint32(4, MAX_NATIVE_PAYLOAD + 1);
    await expect(collect(prefix)).rejects.toThrow("Oversize");
  });
  it("returns the upstream iterator on cancellation", async () => {
    let released = false;
    async function* chunks() {
      try {
        yield encode(config);
        yield encode(packet());
      } finally {
        released = true;
      }
    }
    const decoder = decodeNativeFrames(chunks());
    await decoder.next();
    await decoder.return(undefined);
    expect(released).toBe(true);
  });
});

describe("native stream contract", () => {
  it("preserves host epoch and variable/idle durations through explicit end", () => {
    const sequence = new NativeSequence();
    sequence.accept(config);
    sequence.accept(packet(0, 500000));
    sequence.accept(packet(500000, 8000000, false));
    sequence.accept({ header: { kind: "end", endUs: 8500000 }, payload: new Uint8Array() });
    sequence.finish();
    expect(() => sequence.accept(packet())).toThrow();
  });
  it("refuses absent/config changes, non-key start, overlap, missing end and wrong final duration", () => {
    expect(() => new NativeSequence().accept(packet())).toThrow();
    for (const bad of [config, packet(0, 1, false), packet(1), packet(0, 0)]) {
      const s = new NativeSequence();
      s.accept(config);
      expect(() => s.accept(bad)).toThrow();
    }
    const s = new NativeSequence();
    s.accept(config);
    s.accept(packet());
    expect(() => s.accept(packet(3))).toThrow();
    expect(() => s.finish()).toThrow();
    expect(() =>
      s.accept({ header: { kind: "end", endUs: 1 }, payload: new Uint8Array() }),
    ).toThrow();
  });
});

it("fails closed on missing cursor assertion, mismatched AVC config and malformed NALs", () => {
  for (const change of [
    { cursorPixels: undefined },
    { cursorPixels: "embedded" },
    { width: 641 },
    { codec: "avc1.42001f" },
  ]) {
    const frame = { ...config, header: { ...config.header, ...change } } as NativeCaptureFrame;
    expect(() => new NativeSequence().accept(frame)).toThrow();
  }
  for (const payload of [
    new Uint8Array([0, 0, 0]),
    new Uint8Array([0, 0, 0, 2, 5]),
    new Uint8Array([0, 0, 0, 0]),
    new Uint8Array([0, 0, 0, 1, 128]),
  ]) {
    const sequence = new NativeSequence();
    sequence.accept(config);
    expect(() => sequence.accept({ ...packet(), payload })).toThrow("AVC NAL");
  }
});
