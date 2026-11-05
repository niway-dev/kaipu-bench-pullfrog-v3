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
    if (h.kind === "geometry") {
      const rect = (r: unknown, nonNegativeOrigin: boolean) => {
        if (!r || typeof r !== "object") return false;
        const o = r as Record<string, unknown>;
        if (Object.keys(o).sort().join(",") !== "height,width,x,y") return false;
        const { x, y, width, height } = o as Record<string, number>;
        return (
          [x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n)) &&
          width > 0 &&
          height > 0 &&
          (!nonNegativeOrigin || (x >= 0 && y >= 0))
        );
      };
      if (
        !integer(h.atUs) ||
        frame.payload.length ||
        !rect(h.frame, false) ||
        !rect(h.content, true)
      )
        throw new Error("Invalid native geometry");
    } else if (h.kind === "config") {
      if (
        this.configured ||
        h.version !== 1 ||
        h.cursorPixels !== "excluded" ||
        !/^avc1\.[0-9a-fA-F]{6}$/.test(h.codec) ||
        !integer(h.epochUs) ||
        !integer(h.width) ||
        !integer(h.height) ||
        h.width % 2 !== 0 ||
        h.height % 2 !== 0 ||
        h.width < 2 ||
        h.height < 2 ||
        h.width > 7680 ||
        h.height > 7680 ||
        frame.payload.length < 7 ||
        frame.payload.length > MAX_NATIVE_HEADER ||
        frame.payload[0] !== 1 ||
        (frame.payload[4] & 3) !== 3 ||
        h.codec.toLowerCase() !==
          `avc1.${Array.from(frame.payload.slice(1, 4), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
      )
        throw new Error("Invalid native codec config");
      // Require complete SPS/PPS entries before passing avcC to the muxer/decoder.
      const bytes = frame.payload;
      let offset = 6;
      const sets = (count: number, type: number) => {
        if (!count) throw new Error("Missing AVC parameter sets");
        for (let i = 0; i < count; i++) {
          if (offset + 2 > bytes.length) throw new Error("Truncated AVC parameter set");
          const length = bytes[offset] * 256 + bytes[offset + 1];
          offset += 2;
          if (!length || offset + length > bytes.length || (bytes[offset] & 31) !== type)
            throw new Error("Invalid AVC parameter set");
          offset += length;
        }
      };
      sets(bytes[5] & 31, 7);
      if (offset >= bytes.length) throw new Error("Missing AVC PPS");
      const ppsCount = bytes[offset++];
      sets(ppsCount, 8);
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
      const bytes = frame.payload;
      for (let offset = 0; offset < bytes.length; ) {
        if (offset + 4 > bytes.length) throw new Error("Truncated AVC NAL prefix");
        const size = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
        offset += 4;
        if (!size || offset + size > bytes.length || bytes[offset] & 0x80 || !(bytes[offset] & 31))
          throw new Error("Invalid AVC NAL length/header");
        offset += size;
      }
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
