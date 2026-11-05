import { inflateSync } from "node:zlib";
import type { Rgba } from "./compare";

/**
 * Decodes the PNGs Playwright writes (8-bit, RGB or RGBA, not interlaced) into RGBA. Node's
 * zlib is all it needs, so the comparison does not depend on a tool being on the runner's
 * PATH (a launchd job does not get the login shell's).
 */
export function decodePng(bytes: Uint8Array): Rgba {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const depth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (depth !== 8 || channels === 0 || interlace !== 0) {
    throw new Error(
      `unsupported PNG (depth ${depth}, color type ${colorType}, interlace ${interlace})`,
    );
  }

  const idat: Buffer[] = [];
  for (let offset = 8; offset + 12 <= buf.length; ) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(buf.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error("PNG data has the wrong length");

  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = y * stride;
    const prior = row - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const left = i >= channels ? pixels[row + i - channels] : 0;
      const up = y > 0 ? pixels[prior + i] : 0;
      const upLeft = y > 0 && i >= channels ? pixels[prior + i - channels] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + left;
          break;
        case 2:
          value = x + up;
          break;
        case 3:
          value = x + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          value = x + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter}`);
      }
      pixels[row + i] = value & 0xff;
    }
  }
  if (channels === 4) return { width, height, data: pixels };
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = pixels[p * 3];
    data[p * 4 + 1] = pixels[p * 3 + 1];
    data[p * 4 + 2] = pixels[p * 3 + 2];
    data[p * 4 + 3] = 255;
  }
  return { width, height, data };
}

/**
 * The share of pixels (0 to 1) that have the most common colour, alpha included. A blank
 * window (nothing painted, a solid fill) is above 0.995; a screen with any text, icon or
 * border is far below it.
 */
export function dominantColorFraction(image: Rgba): number {
  const counts = new Map<number, number>();
  const { data } = image;
  let best = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const key = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > best) best = count;
  }
  return best / Math.max(1, image.width * image.height);
}
