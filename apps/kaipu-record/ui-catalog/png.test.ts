import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePng, dominantColorFraction } from "./png";

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  // The decoder does not check CRCs; the value is irrelevant here.
  return out;
}

/** An 8-bit PNG from scanlines that already carry their filter byte. */
function png(width: number, height: number, colorType: 2 | 6, scanlines: number[][]): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(scanlines.flat()))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("decodePng", () => {
  it("reads unfiltered RGBA", () => {
    const image = decodePng(png(2, 1, 6, [[0, 1, 2, 3, 4, 5, 6, 7, 8]]));
    expect(image.width).toBe(2);
    expect([...image.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("adds an opaque alpha to RGB", () => {
    const image = decodePng(png(1, 1, 2, [[0, 10, 20, 30]]));
    expect([...image.data]).toEqual([10, 20, 30, 255]);
  });

  it("undoes the Sub, Up, Average and Paeth filters", () => {
    // Two RGBA pixels per row; each row uses a different filter over the row above.
    const image = decodePng(
      png(2, 5, 6, [
        [0, 10, 20, 30, 40, 50, 60, 70, 80],
        [1, 10, 20, 30, 40, 40, 40, 40, 40], // Sub: second pixel = first + 40
        [2, 1, 1, 1, 1, 1, 1, 1, 1], // Up
        [3, 2, 2, 2, 2, 2, 2, 2, 2], // Average
        [4, 1, 1, 1, 1, 1, 1, 1, 1], // Paeth
      ]),
    );
    const row = (y: number) => Array.from(image.data.slice(y * 8, y * 8 + 8));
    expect(row(0)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(row(1)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(row(2)).toEqual([11, 21, 31, 41, 51, 61, 71, 81]);
    // Average: first pixel = 2 + (0 + up)/2; second = 2 + (left + up)/2.
    expect(row(3)).toEqual([
      7,
      12,
      17,
      22,
      2 + ((7 + 51) >> 1),
      2 + ((12 + 61) >> 1),
      2 + ((17 + 71) >> 1),
      2 + ((22 + 81) >> 1),
    ]);
    expect(image.data.length).toBe(40);
  });

  it("rejects what it cannot decode", () => {
    expect(() => decodePng(new Uint8Array(40))).toThrow("not a PNG");
  });
});

describe("dominantColorFraction", () => {
  const solid = (width: number, height: number) => ({
    width,
    height,
    data: new Uint8Array(width * height * 4).fill(30),
  });

  it("is 1 for a solid image", () => {
    expect(dominantColorFraction(solid(10, 10))).toBe(1);
  });

  it("counts the most common colour, alpha included", () => {
    const image = solid(10, 10);
    image.data[7] = 255;
    expect(dominantColorFraction(image)).toBe(0.99);
  });

  it("stays below the blank limit when a tenth of the pixels differ", () => {
    const image = solid(10, 10);
    for (let p = 0; p < 10; p++) image.data.set([255, 255, 255, 255], p * 4);
    expect(dominantColorFraction(image)).toBe(0.9);
  });
});
