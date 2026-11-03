import { expect, it } from "vitest";
import {
  BufferTarget,
  Output,
  Mp4OutputFormat,
  Input,
  BufferSource,
  ALL_FORMATS,
  EncodedPacketSink,
} from "mediabunny";
import { spawnNativeVideo, validateNativeHelper } from "./session";
import { attachNativeEncodedVideo } from "../../../renderer/src/features/recording/native-encoded-video";
import { writeFile } from "node:fs/promises";

// Explicit native capture opt-in, never Electron. Display must be a 16:9 source.
it.skipIf(!process.env.KAIPU_NATIVE_TEST_HELPER)(
  "muxes the live SCK/VT pipe through the recorder seam, including idle duration",
  async () => {
    const path = process.env.KAIPU_NATIVE_TEST_HELPER!;
    await validateNativeHelper(path);
    const reader = spawnNativeVideo(
      path,
      {
        displayId: Number(process.env.KAIPU_NATIVE_TEST_DISPLAY),
        width: 320,
        height: 180,
        frameRate: 30,
        videoBitrate: 1_000_000,
      },
      true,
    ); // CLI-only test bypass; IPC never enables unmatched-parent capture.
    await reader.ready!();
    await new Promise((resolve) => setTimeout(resolve, 100)); // prepared frames stay out
    const beginAt = performance.now();
    await reader.begin!(beginAt);
    let pauseAt = 0,
      resumeAt = 0,
      stopAt = 0,
      endUs = 0;
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const original: { timestamp: number; duration: number; type: string; data: Uint8Array }[] = [];
    let stop: ReturnType<typeof setTimeout> | undefined;
    const commands: ReturnType<typeof setTimeout>[] = [];
    const transport = attachNativeEncodedVideo(output, {
      ...reader,
      async next() {
        const frame = await reader.next();
        if (frame?.header.kind === "packet")
          original.push({
            timestamp: frame.header.ptsUs / 1e6,
            duration: frame.header.durationUs / 1e6,
            type: frame.header.keyframe ? "key" : "delta",
            data: Uint8Array.from(frame.payload),
          });
        if (frame?.header.kind === "config") {
          commands.push(
            setTimeout(() => {
              pauseAt = performance.now();
              void reader.pause!(pauseAt);
            }, 200),
          );
          commands.push(
            setTimeout(() => {
              resumeAt = performance.now();
              void reader.resume!(resumeAt);
            }, 6400),
          );
          stop = setTimeout(() => {
            stopAt = performance.now();
            void reader.stop(stopAt);
          }, 6900);
        }
        if (frame?.header.kind === "end") endUs = frame.header.endUs;
        return frame;
      },
    });
    try {
      await output.start();
      const result = await transport.pump();
      await output.finalize();
      expect(result).toMatchObject({ width: 320, height: 180, cursorPixels: "excluded" });
      expect(result.epochUs).toBeGreaterThan(0);
      expect(Math.abs(endUs - (stopAt - beginAt - (resumeAt - pauseAt)) * 1000)).toBeLessThan(3);
      const input = new Input({ source: new BufferSource(target.buffer!), formats: ALL_FORMATS });
      try {
        const track = await input.getPrimaryVideoTrack();
        expect(track).not.toBeNull();
        const packets = await Array.fromAsync(new EncodedPacketSink(track!).packets());
        expect(packets.length).toBeGreaterThan(2);
        expect(packets[0].timestamp).toBe(0);
        expect(packets[0].type).toBe("key");
        expect(packets.filter((packet) => packet.type === "key").length).toBeGreaterThanOrEqual(2);
        expect(packets.length).toBe(original.length);
        // Installed mediabunny MP4 muxer GLOBAL_TIMESCALE=57600: allow one tick.
        for (let i = 0; i < packets.length; i++) {
          expect(packets[i].data).toEqual(original[i].data);
          expect(packets[i].type).toBe(original[i].type);
          expect(Math.abs(packets[i].timestamp - original[i].timestamp)).toBeLessThan(
            1 / 57600 + 1e-9,
          );
          expect(Math.abs(packets[i].duration - original[i].duration)).toBeLessThan(
            1 / 57600 + 1e-9,
          );
        }
        const duration = await input.computeDuration();
        expect(duration).toBeGreaterThan(0.65);
        expect(duration).toBeLessThan(3);
        expect(
          Math.abs(packets.at(-1)!.timestamp + packets.at(-1)!.duration - duration),
        ).toBeLessThan(1 / 57600 + 1e-9);
        if (process.env.KAIPU_NATIVE_TEST_OUTPUT)
          await writeFile(process.env.KAIPU_NATIVE_TEST_OUTPUT, new Uint8Array(target.buffer!));
      } finally {
        input.dispose();
      }
    } finally {
      clearTimeout(stop);
      commands.forEach(clearTimeout);
      await reader.cancel();
    }
  },
  15000,
);

it.skipIf(!process.env.KAIPU_NATIVE_TEST_HELPER)(
  "preserves a native take when a stop edge arrives beyond lookbehind",
  async () => {
    const reader = spawnNativeVideo(
      process.env.KAIPU_NATIVE_TEST_HELPER!,
      {
        displayId: Number(process.env.KAIPU_NATIVE_TEST_DISPLAY),
        width: 320,
        height: 180,
        frameRate: 30,
        videoBitrate: 1_000_000,
      },
      true,
    );
    let stop: ReturnType<typeof setTimeout> | undefined;
    try {
      await reader.ready!();
      await reader.begin!(performance.now());
      let packets = 0,
        ended = false;
      for (;;) {
        const frame = await reader.next();
        if (!frame) break;
        if (frame.header.kind === "config") {
          const oldEdge = performance.now();
          stop = setTimeout(() => void reader.stop(oldEdge), 800);
        }
        if (frame.header.kind === "packet") packets++;
        if (frame.header.kind === "end") ended = true;
      }
      expect(packets).toBeGreaterThan(1);
      expect(ended).toBe(true);
    } finally {
      clearTimeout(stop);
      await reader.cancel();
    }
  },
  10000,
);
