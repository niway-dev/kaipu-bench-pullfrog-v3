import type { NativeCaptureFrame, NativeCaptureReader } from "../../../shared/native-capture";

/** What main tells its own listeners about a native session (the hub's cursor tracking). */
export type NativeTransportEvent =
  | { type: "open" }
  | { type: "frame"; frame: NativeCaptureFrame }
  | { type: "end" };

/**
 * Reads a reader's frames as they arrive, tells `onFrame` about each one (null at the end),
 * and hands them on to the renderer's pulls. A window take streams `geometry` frames before
 * `go`, while the renderer is not pulling yet; unread, they would fill the helper's stdout
 * pipe and stall it. The queue is bounded so a slow consumer still backs up into that pipe
 * instead of into main's memory.
 */
export function pumpFrames(
  source: NativeCaptureReader,
  onFrame: (frame: NativeCaptureFrame | null) => void,
  maxQueued = 256,
): NativeCaptureReader {
  const queue: NativeCaptureFrame[] = [];
  let finished = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;
  let resume: (() => void) | null = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };

  void (async () => {
    try {
      while (!finished) {
        if (queue.length >= maxQueued) {
          await new Promise<void>((r) => (resume = r));
          resume = null;
          continue;
        }
        const frame = await source.next();
        onFrame(frame);
        if (frame === null) finished = true;
        else queue.push(frame);
        notify();
      }
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      finished = true;
      notify();
    }
  })();

  return {
    begin: source.begin?.bind(source),
    pause: source.pause?.bind(source),
    resume: source.resume?.bind(source),
    stop: (atMainMs) => source.stop(atMainMs),
    cancel: async () => {
      finished = true;
      resume?.();
      notify();
      await source.cancel();
    },
    async next() {
      for (;;) {
        const frame = queue.shift();
        if (frame) {
          resume?.();
          return frame;
        }
        if (failure) throw failure;
        if (finished) return null;
        await new Promise<void>((r) => (wake = r));
      }
    },
  };
}
