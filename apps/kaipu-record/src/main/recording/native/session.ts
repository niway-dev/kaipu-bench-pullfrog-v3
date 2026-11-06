import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { promisify } from "node:util";
import { decodeNativeFrames } from "./framing";
import { NativeSequence } from "../../../shared/native-capture-sequence";
import type { NativeCaptureReader } from "../../../shared/native-capture";

import type {
  NativeCaptureRequest,
  NativeVideoRequest,
  NativeWindowRequest,
} from "../../../shared/native-capture";
export function nativeHelperPath(resourcesPath: string, appPath?: string): string {
  if (appPath) {
    for (const root of [appPath, join(appPath, "..", "..")]) {
      const dev = join(root, "resources", "native", "kaipu-encoded-capture");
      if (existsSync(dev)) return dev;
    }
  }
  return join(resourcesPath, "app.asar.unpacked", "resources", "native", "kaipu-encoded-capture");
}
/** Bumped when the helper protocol or clock changes, so a stale binary is refused. */
export const HELPER_VERSION =
  "kaipu-encoded-capture/4 source-rect window-geometry continuous-clock";
export async function validateNativeHelper(path: string): Promise<void> {
  const { stdout } = await promisify(execFile)(path, ["--version"], {
    timeout: 2000,
    maxBuffer: 1024,
  });
  if (stdout.trim() !== HELPER_VERSION) throw new Error("Unsupported native helper version");
}
export function validateNativeRequest(request: NativeCaptureRequest): void {
  const keys = request ? Object.keys(request).sort().join(",") : "";
  if (keys === "frameRate,height,videoBitrate,width,windowId") {
    const { windowId, width, height, frameRate, videoBitrate } = request as NativeWindowRequest;
    // Same bounds as a display request, minus the display's aspect rules: a window is
    // fitted into the fixed output (`scalesToFit`).
    if (
      ![windowId, width, height, frameRate, videoBitrate].every(Number.isSafeInteger) ||
      windowId < 1 ||
      windowId > 0xffff_ffff ||
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
    return;
  }
  if (
    keys !== "displayId,frameRate,height,videoBitrate,width" &&
    keys !== "displayId,frameRate,height,sourceRect,videoBitrate,width"
  )
    throw new Error("Unsupported native capture options");
  const { displayId, width, height, frameRate, videoBitrate, sourceRect } =
    request as NativeVideoRequest;
  if (sourceRect !== undefined) {
    if (
      !sourceRect ||
      Object.keys(sourceRect).sort().join(",") !== "height,width,x,y" ||
      ![sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height].every(
        Number.isSafeInteger,
      ) ||
      sourceRect.x < 0 ||
      sourceRect.y < 0 ||
      sourceRect.width < 2 ||
      sourceRect.height < 2
    )
      throw new Error("Invalid native source rect");
  }
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
export function spawnNativeVideo(
  path: string,
  request: NativeCaptureRequest,
  testAllowUnmatchedParent = false,
  stallTimeoutMs = 5000,
  /** Test-only helper flags (`--test-window`); IPC never passes any. */
  extraArgs: string[] = [],
): NativeCaptureReader {
  validateNativeRequest(request);
  if (testAllowUnmatchedParent && "windowId" in request)
    throw new Error("The unmatched-parent bypass is not available for a window");
  const child = spawn(
    path,
    [
      "--encoded-capture-v1",
      ...("windowId" in request ? ["--window", request.windowId] : [request.displayId]),
      request.width,
      request.height,
      request.frameRate,
      request.videoBitrate,
      ...("sourceRect" in request && request.sourceRect
        ? [
            "--source-rect",
            request.sourceRect.x,
            request.sourceRect.y,
            request.sourceRect.width,
            request.sourceRect.height,
          ]
        : []),
      ...extraArgs,
      ...(testAllowUnmatchedParent ? ["--test-allow-unmatched-parent"] : []),
    ].map(String),
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  child.stdin.on("error", () => {}); // Exit/next reports pipe failures with bounded stderr.
  const frames = decodeNativeFrames(child.stdout);
  const sequence = new NativeSequence();
  // Node hrtime (libuv) and the helper's CLOCK_MONOTONIC_RAW are both mach_continuous_time,
  // including sleep. CMClockGetHostTimeClock is not (NIW2-649). Bun does not match.
  const hostOffsetUs = Number(process.hrtime.bigint() / 1000n) - performance.now() * 1000;
  const hostAt = (ms: number) => {
    if (!Number.isFinite(ms) || Math.abs(ms - performance.now()) > 10_000)
      throw new Error("Invalid native command clock");
    return Math.round(ms * 1000 + hostOffsetUs);
  };
  const command = async (name: string, ms: number) => {
    if (cancelled || ended) throw new Error("Native capture closed");
    child.stdin.write(`${name} ${hostAt(ms)}\n`);
  };
  let paused = false;
  let refreshReadTimeout: (() => void) | undefined;
  let prepared = false;
  // A window take streams only changes before `go`, so a still window is silent while the take
  // is prepared and the countdown runs: no stall timer between `ready` and `go`.
  let begun = false;
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
  const reader: NativeCaptureReader = {
    async ready() {
      if (prepared) return;
      const frame = await reader.next();
      if (frame?.header.kind !== "ready" || frame.header.version !== 1 || frame.payload.length) {
        await cancel();
        throw new Error("Native helper did not become ready");
      }
      prepared = true;
    },
    async begin(ms) {
      await command("go", ms);
      begun = true;
      refreshReadTimeout?.();
    },
    async pause(ms) {
      await command("pause", ms);
      paused = true;
      refreshReadTimeout?.();
    },
    async resume(ms) {
      await command("resume", ms);
      paused = false;
      refreshReadTimeout?.();
    },
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
              // Exit first: a failed helper's stderr reason beats the sequence's
              // generic "no final duration" error.
              await exited;
              sequence.finish();
            }
            return result;
          }),
          new Promise<never>((_, reject) => {
            refreshReadTimeout = () => {
              clearTimeout(timeout);
              if (!paused && (!prepared || begun))
                timeout = setTimeout(
                  () => reject(new Error("Native capture stalled")),
                  stallTimeoutMs,
                );
            };
            refreshReadTimeout();
          }),
        ]);
        if (cancelled) throw new Error("Native capture cancelled");
        if (result.done) {
          ended = true;
          return null;
        }
        if (result.value.header.kind === "ready") {
          if (prepared) throw new Error("Duplicate native readiness");
        } else sequence.accept(result.value);
        if (result.value.header.kind === "config")
          result.value.header.epochMainMs = (result.value.header.epochUs - hostOffsetUs) / 1000;
        else if (result.value.header.kind === "geometry")
          result.value.header.atMainMs = (result.value.header.atUs - hostOffsetUs) / 1000;
        return result.value;
      } catch (error) {
        await cancel();
        throw error;
      } finally {
        clearTimeout(timeout);
        refreshReadTimeout = undefined;
        busy = false;
      }
    },
    async stop(atMainMs = performance.now()) {
      if (cancelled || stopped || ended) return;
      stopped = true;
      paused = false;
      refreshReadTimeout?.();
      child.stdin.end(`stop ${hostAt(atMainMs)}\n`); // Consumer must keep pulling through end and process exit.
    },
    cancel,
  };
  return reader;
}
