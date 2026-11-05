import { app, desktopCapturer, ipcMain, type WebContents } from "electron";
import {
  NATIVE_CAPTURE_CHANNELS as channels,
  type NativeCaptureReader,
  type NativeVideoRequest,
} from "../../../shared/native-capture";
import { onPageGone } from "../../renderer-lifetime";
import { nativeHelperPath, spawnNativeVideo, validateNativeHelper } from "./session";

/** Explicit developer transport only. No file path or process arguments come from IPC. */
export function registerNativeCaptureTransport(owner: () => WebContents | undefined): {
  /** A native session is open: the helper records the screen without any window of ours. */
  isOpen: () => boolean;
} {
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
    ipcMain.handle(
      channel,
      async (event, request?: (NativeVideoRequest & { sourceId?: string }) | number | boolean) => {
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
            const { sourceId, ...videoRequest } = request;
            if (sourceId) {
              if (!sourceId.startsWith("screen:")) throw new Error("Native requires whole display");
              const sources = await desktopCapturer.getSources({
                types: ["screen"],
                thumbnailSize: { width: 0, height: 0 },
              });
              videoRequest.displayId = Number(
                sources.find((source) => source.id === sourceId)?.display_id,
              );
            }
            if (openedGeneration !== generation || contents.isDestroyed())
              throw new Error("Native open cancelled");
            reader = spawnNativeVideo(path, videoRequest);
            detach = onPageGone(contents, () => {
              void cancel();
            });
            try {
              await reader.ready?.();
            } catch (error) {
              await cancel();
              throw error;
            }
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
      },
    );
  }
  app.on("before-quit", () => {
    void cancel();
  });
  return { isOpen: () => reader !== null };
}
