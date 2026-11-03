import { MAX_NATIVE_HEADER, MAX_NATIVE_PAYLOAD, type NativeCaptureFrame } from "./native-capture";

/** Validate again in the renderer: IPC is a trust boundary too. */
export class NativeSequence {
  private configured = false;
  private ended = false;
  private endUs = -1;
  private packets = 0;
  accept(frame: NativeCaptureFrame): void {
    const h = frame.header;
    if (this.ended || !h || frame.payload.length > MAX_NATIVE_PAYLOAD)
      throw new Error("Invalid native sequence");
    const integer = (n: number) => Number.isSafeInteger(n) && n >= 0;
    if (h.kind === "config") {
      if (
        this.configured ||
        h.version !== 1 ||
        !/^avc1\.[0-9a-fA-F]{6}$/.test(h.codec) ||
        !integer(h.epochUs) ||
        !integer(h.width) ||
        !integer(h.height) ||
        h.width < 2 ||
        h.height < 2 ||
        h.width > 7680 ||
        h.height > 7680 ||
        frame.payload.length < 7 ||
        frame.payload.length > MAX_NATIVE_HEADER ||
        frame.payload[0] !== 1
      )
        throw new Error("Invalid native codec config");
      this.configured = true;
    } else if (h.kind === "packet") {
      if (
        !this.configured ||
        !integer(h.ptsUs) ||
        !integer(h.durationUs) ||
        h.durationUs === 0 ||
        !integer(h.ptsUs + h.durationUs) ||
        h.ptsUs < this.endUs ||
        typeof h.keyframe !== "boolean" ||
        (!this.packets && (!h.keyframe || h.ptsUs !== 0)) ||
        !frame.payload.length
      )
        throw new Error("Invalid native packet timing/keyframe");
      this.packets++;
      this.endUs = h.ptsUs + h.durationUs;
    } else if (h.kind === "end") {
      if (!this.packets || !integer(h.endUs) || h.endUs !== this.endUs || frame.payload.length)
        throw new Error("Invalid native end duration");
      this.ended = true;
    } else throw new Error("Unknown native frame");
  }
  finish(): void {
    if (!this.ended) throw new Error("Native stream ended without final duration");
  }
}
