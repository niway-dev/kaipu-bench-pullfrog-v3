import {
  MAX_NATIVE_HEADER,
  MAX_NATIVE_PAYLOAD,
  type NativeCaptureFrame,
} from "../../../shared/native-capture";

/** Pull-only decoder: one frame retained, rejects advertised sizes before allocation. */
export async function* decodeNativeFrames(
  chunks: AsyncIterable<Uint8Array>,
): AsyncGenerator<NativeCaptureFrame> {
  const iterator = chunks[Symbol.asyncIterator]();
  let chunk: Uint8Array = new Uint8Array(0),
    offset = 0;
  async function read(size: number, eof = false): Promise<Uint8Array | null> {
    const bytes = new Uint8Array(size);
    let written = 0;
    while (written < size) {
      if (offset === chunk.length) {
        const next = await iterator.next();
        if (next.done) {
          if (eof && written === 0) return null;
          throw new Error("Truncated native capture frame");
        }
        chunk = next.value;
        offset = 0;
        if (chunk.length > MAX_NATIVE_PAYLOAD + MAX_NATIVE_HEADER + 8)
          throw new Error("Oversize native input chunk");
      }
      const count = Math.min(size - written, chunk.length - offset);
      bytes.set(chunk.subarray(offset, offset + count), written);
      offset += count;
      written += count;
    }
    return bytes;
  }
  try {
    for (;;) {
      const prefix = await read(8, true);
      if (!prefix) return;
      const view = new DataView(prefix.buffer);
      const headerSize = view.getUint32(0),
        payloadSize = view.getUint32(4);
      if (!headerSize || headerSize > MAX_NATIVE_HEADER || payloadSize > MAX_NATIVE_PAYLOAD)
        throw new Error("Oversize native capture frame");
      const header = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode((await read(headerSize))!),
      );
      const payload = (await read(payloadSize))!;
      yield { header, payload };
    }
  } finally {
    await iterator.return?.();
  }
}
