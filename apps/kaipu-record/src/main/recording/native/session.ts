import { spawn, execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { decodeNativeFrames } from "./framing";
import { NativeSequence } from "../../../shared/native-capture-sequence";
import type { NativeCaptureReader } from "../../../shared/native-capture";

import type { NativeVideoRequest } from "../../../shared/native-capture";
export function nativeHelperPath(resourcesPath: string): string {
  return join(resourcesPath, "app.asar.unpacked", "resources", "native", "kaipu-encoded-capture");
}
export async function validateNativeHelper(path: string): Promise<void> {
  const { stdout } = await promisify(execFile)(path, ["--version"], {
    timeout: 2000,
    maxBuffer: 1024,
  });
  if (stdout.trim() !== "kaipu-encoded-capture/1 video-only no-pause")
    throw new Error("Unsupported native helper version");
}
export function validateNativeRequest(request: NativeVideoRequest): void {
  if (
    !request ||
    Object.keys(request).sort().join(",") !== "displayId,frameRate,height,videoBitrate,width"
  )
    throw new Error("Unsupported native capture options");
  const { displayId, width, height, frameRate, videoBitrate } = request;
  if (
    ![displayId, width, height, frameRate, videoBitrate].every(Number.isSafeInteger) ||
    displayId < 1 ||
    width < 2 ||
    height < 2 ||
    width > 7680 ||
    height > 7680 ||
    width % 2 ||
    height % 2 ||
    frameRate < 1 ||
    frameRate > 60 ||
    videoBitrate < 100_000 ||
    videoBitrate > 100_000_000
  )
    throw new Error("Invalid native video request");
}

/** One awaited pull crosses IPC at a time; stdout's pipe is the bounded queue. */
export function spawnNativeVideo(path: string, request: NativeVideoRequest): NativeCaptureReader {
  validateNativeRequest(request);
  const child = spawn(
    path,
    [
      "--encoded-capture-v1",
      request.displayId,
      request.width,
      request.height,
      request.frameRate,
      request.videoBitrate,
    ].map(String),
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  child.stdin.on("error", () => {}); // Exit/next reports pipe failures with bounded stderr.
  const frames = decodeNativeFrames(child.stdout);
  const sequence = new NativeSequence();
  let busy = false,
    cancelled = false,
    stopped = false,
    ended = false;
  let stderr = "";
  child.stderr.on("data", (data: Buffer) => {
    stderr = (stderr + data.toString()).slice(-2048);
  });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 || cancelled
        ? resolve()
        : reject(new Error(`Native helper failed (${code}): ${stderr}`)),
    );
  });
  // A crash before the next pull must not become an unhandled rejection.
  void exited.catch(() => {});
  const cancel = async (): Promise<void> => {
    if (cancelled) return;
    cancelled = true;
    child.stdin.destroy();
    child.stdout.destroy();
    child.kill("SIGTERM");
    const kill = setTimeout(() => child.kill("SIGKILL"), 1000);
    try {
      await exited.catch(() => {});
    } finally {
      clearTimeout(kill);
    }
  };
  return {
    async next() {
      if (busy) throw new Error("Concurrent native packet pull");
      if (cancelled) throw new Error("Native capture cancelled");
      if (ended) return null;
      busy = true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          frames.next().then(async (result) => {
            if (result.done) {
              sequence.finish();
              await exited;
            }
            return result;
          }),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Native capture stalled")), 5000);
          }),
        ]);
        if (cancelled) throw new Error("Native capture cancelled");
        if (result.done) {
          ended = true;
          return null;
        }
        sequence.accept(result.value);
        return result.value;
      } catch (error) {
        await cancel();
        throw error;
      } finally {
        clearTimeout(timeout);
        busy = false;
      }
    },
    async stop() {
      if (cancelled || stopped || ended) return;
      stopped = true;
      child.stdin.end("stop\n"); // Consumer must keep pulling through end and process exit.
    },
    cancel,
  };
}
