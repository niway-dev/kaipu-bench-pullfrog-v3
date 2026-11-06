import { describe, expect, it, vi } from "vitest";
import type { NativeCaptureFrame, NativeCaptureReader } from "../../../shared/native-capture";
import { pumpFrames } from "./frame-pump";

const geometry = (atUs: number): NativeCaptureFrame => ({
  header: {
    kind: "geometry",
    atUs,
    frame: { x: 0, y: 0, width: 400, height: 300 },
    content: { x: 0, y: 0, width: 400, height: 300 },
  },
  payload: new Uint8Array(),
});

function scripted(frames: (NativeCaptureFrame | null | Error)[]) {
  const queue = [...frames];
  const next = vi.fn(async () => {
    const item = queue.shift();
    if (item instanceof Error) throw item;
    return item ?? null;
  });
  const reader: NativeCaptureReader = {
    next,
    stop: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    begin: vi.fn(async () => {}),
  };
  return { reader, next };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("pumpFrames", () => {
  it("reads and reports frames before anyone pulls", async () => {
    const seen: string[] = [];
    const { reader } = scripted([geometry(1), geometry(2), null]);
    pumpFrames(reader, (frame) => seen.push(frame ? frame.header.kind : "end"));
    await tick();
    expect(seen).toEqual(["geometry", "geometry", "end"]);
  });

  it("hands the same frames to the consumer in order, then null", async () => {
    const { reader } = scripted([geometry(1), geometry(2), null]);
    const pumped = pumpFrames(reader, () => {});
    const a = await pumped.next();
    const b = await pumped.next();
    expect(a?.header).toMatchObject({ kind: "geometry", atUs: 1 });
    expect(b?.header).toMatchObject({ kind: "geometry", atUs: 2 });
    expect(await pumped.next()).toBeNull();
    expect(await pumped.next()).toBeNull();
  });

  it("is bounded: stops pulling when the consumer is behind, resumes when it catches up", async () => {
    const frames = Array.from({ length: 10 }, (_, i) => geometry(i));
    const { reader, next } = scripted(frames);
    const pumped = pumpFrames(reader, () => {}, 2);
    await tick();
    expect(next.mock.calls.length).toBeLessThanOrEqual(3);
    await pumped.next();
    await pumped.next();
    await tick();
    expect(next.mock.calls.length).toBeGreaterThan(3);
  });

  it("delivers a read error to the consumer", async () => {
    const { reader } = scripted([geometry(1), new Error("Native capture stalled")]);
    const pumped = pumpFrames(reader, () => {});
    expect((await pumped.next())?.header.kind).toBe("geometry");
    await expect(pumped.next()).rejects.toThrow("Native capture stalled");
  });

  it("passes commands through and cancels the source", async () => {
    const { reader } = scripted([null]);
    const pumped = pumpFrames(reader, () => {});
    await pumped.begin?.(5);
    await pumped.stop(6);
    await pumped.cancel();
    expect(reader.begin).toHaveBeenCalledWith(5);
    expect(reader.stop).toHaveBeenCalledWith(6);
    expect(reader.cancel).toHaveBeenCalled();
  });

  it("a consumer waiting when the frame arrives gets it", async () => {
    const { reader } = scripted([]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    (reader.next as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      await gate;
      return geometry(7);
    });
    const pumped = pumpFrames(reader, () => {});
    const pending = pumped.next();
    release();
    expect((await pending)?.header).toMatchObject({ atUs: 7 });
  });
});
