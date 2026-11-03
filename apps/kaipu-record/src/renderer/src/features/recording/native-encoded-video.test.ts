import { expect, it, vi } from "vitest";
import { attachNativeEncodedVideo } from "./native-encoded-video";
import { Output, Mp4OutputFormat, BufferTarget, EncodedVideoPacketSource } from "mediabunny";
import type { NativeCaptureFrame, NativeCaptureReader } from "@shared/native-capture";

it("awaits mediabunny backpressure before pulling another IPC frame; propagates cancellation", async () => {
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  let release!: () => void;
  const add = vi.spyOn(EncodedVideoPacketSource.prototype, "add").mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const frames: NativeCaptureFrame[] = [
    {
      header: {
        kind: "config",
        version: 1,
        codec: "avc1.64001f",
        epochUs: 999,
        width: 640,
        height: 360,
      },
      payload: new Uint8Array([1, 100, 0, 31, 255, 225, 0]),
    },
    {
      header: { kind: "packet", ptsUs: 0, durationUs: 8000000, keyframe: true },
      payload: new Uint8Array([1]),
    },
  ];
  const reader: NativeCaptureReader = {
    next: vi.fn(async () => frames.shift() ?? null),
    stop: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  };
  const handle = attachNativeEncodedVideo(output, reader);
  await output.start();
  const pump = handle.pump();
  await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(1));
  expect(reader.next).toHaveBeenCalledTimes(2);
  expect(add.mock.calls[0][0].duration).toBe(8);
  expect(add.mock.calls[0][1]?.decoderConfig?.codec).toBe("avc1.64001f");
  await handle.stop();
  expect(reader.stop).toHaveBeenCalledOnce();
  release();
  await expect(pump).rejects.toThrow("without final duration");
  expect(reader.cancel).toHaveBeenCalledOnce();
  add.mockRestore();
});
