import { app, ipcMain, type WebContents } from "electron";
import {
  NATIVE_CAPTURE_CHANNELS as channels,
  type NativeCaptureReader,
  type NativeVideoRequest,
} from "../../../shared/native-capture";
import { nativeHelperPath, spawnNativeVideo, validateNativeHelper } from "./session";

/** Explicit developer transport only. No file path or process arguments come from IPC. */
export function registerNativeCaptureTransport(owner: () => WebContents | undefined): void {
  let reader: NativeCaptureReader | null = null;
  let opening = false;
  let generation = 0;
  let detach: (() => void) | undefined;
  const path = nativeHelperPath(process.resourcesPath);
  const capability = async () => {
    const reason =
      "Video-only transport: audio, area, pause clocks, signing/TCC and recorder selection remain unvalidated";
    if (
      process.platform !== "darwin" ||
      !process.argv.includes("--experimental-native-encoded-transport")
    )
      return { transportAvailable: false, recordingReady: false as const, reason };
    try {
      await validateNativeHelper(path);
      return { transportAvailable: true, recordingReady: false as const, reason };
    } catch {
      return {
        transportAvailable: false,
        recordingReady: false as const,
        reason: "Native helper missing or incompatible",
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
    ipcMain.handle(channel, async (event, request?: NativeVideoRequest) => {
      const contents = owner();
      if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame)
        throw new Error("Unauthorized native capture caller");
      if (method === "capability") return capability();
      if (method === "cancel") return cancel();
      if (method === "open") {
        if (reader || opening) throw new Error("Native capture already open");
        opening = true;
        const openedGeneration = generation;
        try {
          if (
            !(await capability()).transportAvailable ||
            !request ||
            contents.isDestroyed() ||
            openedGeneration !== generation
          )
            throw new Error("Native transport unavailable");
          reader = spawnNativeVideo(path, request);
          const cleanup = () => {
            void cancel();
          };
          contents.once("destroyed", cleanup);
          contents.once("render-process-gone", cleanup);
          contents.once("did-start-navigation", cleanup);
          detach = () => {
            contents.removeListener("destroyed", cleanup);
            contents.removeListener("render-process-gone", cleanup);
            contents.removeListener("did-start-navigation", cleanup);
          };
          return;
        } finally {
          opening = false;
        }
      }
      if (!reader) throw new Error("No native capture session");
      if (method === "stop") return reader.stop();
      const active = reader;
      const frame = await active.next();
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
}
