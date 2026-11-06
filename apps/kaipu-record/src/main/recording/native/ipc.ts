import { app, desktopCapturer, ipcMain, screen, type WebContents } from "electron";
import {
  NATIVE_CAPTURE_CHANNELS as channels,
  type NativeCaptureReader,
  type NativeOpenRequest,
  type NativeVideoRequest,
  type NativeWindowRequest,
} from "../../../shared/native-capture";
import type { RecordingArea } from "@shared/types/ipc";
import { RESOLUTION_STEPS } from "@shared/recording-quality";
import { sanitizeArea } from "../area-geometry";
import { onPageGone } from "../../renderer-lifetime";
import { type NativeTransportEvent, pumpFrames } from "./frame-pump";
import { nativeHelperPath, spawnNativeVideo, validateNativeHelper } from "./session";

/** The tallest output the renderer ever plans (the top quality step's height cap). */
const MAX_WINDOW_HEIGHT = Math.max(...RESOLUTION_STEPS);

/** Explicit developer transport only. No file path or process arguments come from IPC. */
export function registerNativeCaptureTransport(
  owner: () => WebContents | undefined,
  hubArea: () => RecordingArea | null | undefined = () => undefined,
): {
  /** A native session is open: the helper records the screen without any window of ours. */
  isOpen: () => boolean;
  /** Session events for main's own consumers (the cursor tracker); `geometry` frames arrive here. */
  onEvent: (listener: (event: NativeTransportEvent) => void) => () => void;
} {
  const listeners = new Set<(event: NativeTransportEvent) => void>();
  const emit = (event: NativeTransportEvent) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("native transport listener failed", error);
      }
    }
  };
  let reader: NativeCaptureReader | null = null;
  let opening = false;
  let generation = 0;
  let detach: (() => void) | undefined;
  const path = nativeHelperPath(
    process.resourcesPath,
    app.isPackaged ? undefined : app.getAppPath(),
  );
  // Set by the renderer's `native-cursor-capture` flag on each capability check, so a
  // flag turned off stops the next take from opening the helper.
  let requestedByFlag = false;
  const capability = async () => {
    const experimentalRequested =
      requestedByFlag || process.argv.includes("--experimental-native-recording");
    const reason =
      "Experimental whole-display capture; duplicated Chromium acquisition for audio/thumbnail; signing/TCC and motion unvalidated";
    if (process.platform !== "darwin" || !experimentalRequested)
      return {
        transportAvailable: false,
        recordingReady: false as const,
        reason,
        experimentalRequested,
      };
    try {
      await validateNativeHelper(path);
      return {
        transportAvailable: true,
        recordingReady: false as const,
        reason,
        experimentalRequested,
      };
    } catch {
      return {
        transportAvailable: false,
        recordingReady: false as const,
        reason: "Native helper missing or incompatible",
        experimentalRequested,
      };
    }
  };
  const cancel = async () => {
    generation++;
    detach?.();
    detach = undefined;
    const active = reader;
    reader = null;
    await active?.cancel();
  };
  for (const [method, channel] of Object.entries(channels)) {
    ipcMain.handle(channel, async (event, request?: NativeOpenRequest | number | boolean) => {
      const contents = owner();
      if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame)
        throw new Error("Unauthorized native capture caller");
      if (method === "capability") {
        requestedByFlag = request === true;
        return capability();
      }
      if (method === "cancel") return cancel();
      if (method === "open") {
        if (reader || opening) throw new Error("Native capture already open");
        opening = true;
        const openedGeneration = generation;
        // A reload during the awaits below neither destroys the contents nor reaches
        // the page-gone listener attached after spawn; invalidate this open instead.
        const detachEarly = onPageGone(contents, () => {
          generation++;
        });
        try {
          if (
            !(await capability()).transportAvailable ||
            !request ||
            contents.isDestroyed() ||
            openedGeneration !== generation
          )
            throw new Error("Native transport unavailable");
          if (typeof request !== "object") throw new Error("Invalid request");
          // `displayId` and `sourceRect` are main's to set; whatever the renderer sent is dropped.
          const {
            sourceId,
            area,
            displayId: _d,
            sourceRect: _r,
            ...rest
          } = request as NativeOpenRequest & {
            displayId?: unknown;
            sourceRect?: unknown;
          };
          let videoRequest = rest as NativeVideoRequest | NativeWindowRequest;
          if (sourceId?.startsWith("window:")) {
            if (area) throw new Error("Native area needs a display source");
            // `window:<n>:0`: n is the CGWindowID (spike W0), what the helper's --window takes.
            const match = /^window:(\d+):0$/.exec(sourceId);
            const windowId = match ? Number(match[1]) : 0;
            if (!Number.isSafeInteger(windowId) || windowId < 1 || windowId > 0xffff_ffff)
              throw new Error("Invalid native window source");
            const { width, height, frameRate, videoBitrate } = rest as NativeVideoRequest;
            const validSide = (n: unknown) =>
              Number.isSafeInteger(n) &&
              (n as number) >= 2 &&
              (n as number) <= 7680 &&
              (n as number) % 2 === 0;
            // The renderer measured the window stream and fitted it to the quality cap (even
            // sides); main cannot read a window's size, so it only refuses what the helper would.
            // The height is also capped by the tallest quality step, as `fitToCap` does.
            if (!validSide(width) || !validSide(height) || (height as number) > MAX_WINDOW_HEIGHT)
              throw new Error("Invalid native window output size");
            // Only windows on screen: a minimized or off-Space window falls back to Chromium
            // before anything is encoded. (Once recording, minimizing holds the last frame.)
            const sources = await desktopCapturer.getSources({
              types: ["window"],
              thumbnailSize: { width: 0, height: 0 },
            });
            if (!sources.some((source) => source.id === sourceId))
              throw new Error("Native window is not on screen");
            videoRequest = { windowId, width, height, frameRate, videoBitrate };
          } else if (sourceId) {
            if (!sourceId.startsWith("screen:")) throw new Error("Native requires whole display");
            const video = videoRequest as NativeVideoRequest;
            const sources = await desktopCapturer.getSources({
              types: ["screen"],
              thumbnailSize: { width: 0, height: 0 },
            });
            video.displayId = Number(sources.find((source) => source.id === sourceId)?.display_id);
            if (area) {
              // Same validation the hub applies to a recording start: the area must name
              // this display and is clamped to its bounds. Display points with the origin
              // at the display's top-left is what the helper's --source-rect takes.
              const display = screen
                .getAllDisplays()
                .find((candidate) => candidate.id === video.displayId);
              // The hub's area is the source of truth: the cursor track is normalized to it.
              // A renderer copy that differs would draw the cursor offset, so refuse and let
              // the take fall back to Chromium.
              const chosen = hubArea();
              if (
                !chosen ||
                chosen.displayId !== area.displayId ||
                JSON.stringify(chosen.rect) !== JSON.stringify(area.rect)
              )
                throw new Error("Native area differs from the recording area");
              const safe = display ? sanitizeArea(chosen, display) : null;
              if (!safe) throw new Error("Native area is not on the captured display");
              video.sourceRect = safe.rect;
            }
          } else if (area) throw new Error("Native area needs a display source");
          if (openedGeneration !== generation || contents.isDestroyed())
            throw new Error("Native open cancelled");
          reader = spawnNativeVideo(path, videoRequest);
          detach = onPageGone(contents, () => {
            void cancel();
          });
          emit({ type: "open" });
          try {
            await reader.ready?.();
          } catch (error) {
            await cancel();
            throw error;
          }
          // A window take streams geometry before `go`: main reads it from here on, so the
          // helper's stdout never fills while the renderer is not pulling yet.
          if ("windowId" in videoRequest)
            reader = pumpFrames(reader, (frame) =>
              emit(frame ? { type: "frame", frame } : { type: "end" }),
            );
          if (openedGeneration !== generation || contents.isDestroyed()) {
            await cancel();
            throw new Error("Native open cancelled");
          }
          return;
        } finally {
          detachEarly();
          opening = false;
        }
      }
      // A stop after the helper ended by itself (a window closed) has nothing to stop: the
      // take is complete and the renderer only has to finalize it.
      if (!reader && method === "stop") return;
      if (!reader) throw new Error("No native capture session");
      if (["begin", "pause", "resume", "stop"].includes(method)) {
        if (typeof request !== "number" || !Number.isFinite(request))
          throw new Error("Missing command clock");
        if (method === "stop") return reader.stop(request);
        if (method === "begin") return reader.begin?.(request);
        if (method === "pause") return reader.pause?.(request);
        return reader.resume?.(request);
      }
      const active = reader;
      let frame;
      try {
        frame = await active.next();
      } catch (error) {
        if (reader === active) await cancel();
        throw error;
      }
      if (frame === null && reader === active) {
        reader = null;
        detach?.();
        detach = undefined;
      }
      return frame;
    });
  }
  app.on("before-quit", () => {
    void cancel();
  });
  return {
    isOpen: () => reader !== null,
    onEvent: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
