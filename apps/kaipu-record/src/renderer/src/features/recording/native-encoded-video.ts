import { EncodedPacket, EncodedVideoPacketSource, type Output } from "mediabunny";
import type { NativeCaptureReader } from "@shared/native-capture";
import { NativeSequence } from "@shared/native-capture-sequence";

/** Recorder-engine seam: attach before output.start(), then pump until explicit end.
 * No decoding/compositor or implicit acquisition/fallback. Caller owns output finalization.
 * prepareEngine owns selection, clock commands and the existing audio/writer lifecycle.
 */
export function attachNativeEncodedVideo(
  output: Output,
  reader: NativeCaptureReader,
  onConfig?: (
    header: Extract<
      import("@shared/native-capture").NativeCaptureFrame["header"],
      { kind: "config" }
    >,
  ) => void,
) {
  const source = new EncodedVideoPacketSource("avc");
  // Do not set frameRate metadata: mediabunny would snap native host timing to a grid.
  output.addVideoTrack(source);
  let pumping = false;
  return {
    stop: () => reader.stop(),
    cancel: () => reader.cancel(),
    async pump(): Promise<{
      epochUs: number;
      width: number;
      height: number;
      cursorPixels: "excluded";
    }> {
      if (pumping) throw new Error("Native video pump already started");
      pumping = true;
      const sequence = new NativeSequence();
      let config: VideoDecoderConfig | undefined;
      let cursorPixels: "excluded" | undefined;
      let epochUs = 0,
        width = 0,
        height = 0;
      try {
        for (;;) {
          const frame = await reader.next();
          if (!frame) break;
          sequence.accept(frame);
          const h = frame.header;
          if (h.kind === "config") {
            onConfig?.(h);
            cursorPixels = h.cursorPixels;
            epochUs = h.epochUs;
            width = h.width;
            height = h.height;
            config = {
              codec: h.codec,
              codedWidth: width,
              codedHeight: height,
              description: Uint8Array.from(frame.payload),
            };
          } else if (h.kind === "packet") {
            await source.add(
              new EncodedPacket(
                frame.payload,
                h.keyframe ? "key" : "delta",
                h.ptsUs / 1e6,
                h.durationUs / 1e6,
              ),
              config ? { decoderConfig: config } : undefined,
            );
            config = undefined;
          }
        }
        sequence.finish();
        source.close();
        if (cursorPixels !== "excluded") throw new Error("Missing cursor exclusion assertion");
        return { epochUs, width, height, cursorPixels };
      } catch (error) {
        await Promise.allSettled([reader.cancel(), output.cancel()]);
        throw error;
      }
    },
  };
}
