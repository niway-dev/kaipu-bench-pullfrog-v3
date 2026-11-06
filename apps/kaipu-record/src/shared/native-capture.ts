import type { RecordingArea } from "./types/ipc";

/** Experimental live transport v1. Integers are host-clock microseconds; no B frames. */
export const NATIVE_CAPTURE_VERSION = 1;
export const MAX_NATIVE_HEADER = 16 * 1024;
export const MAX_NATIVE_PAYLOAD = 8 * 1024 * 1024;
export type NativeRect = { x: number; y: number; width: number; height: number };
export type NativeCaptureFrame = {
  header:
    | { kind: "ready"; version: 1 }
    | {
        kind: "config";
        version: 1;
        codec: string;
        width: number;
        height: number;
        epochUs: number;
        cursorPixels: "excluded";
        epochMainMs?: number;
      }
    | {
        /** Window sources only. Emitted before `config` and again on every change. */
        kind: "geometry";
        /** Host-clock microseconds, the same clock as `config.epochUs`. */
        atUs: number;
        /** `atUs` on main's `performance.now()` clock; set by main's session, never by the helper. */
        atMainMs?: number;
        /** The window in screen points, origin top-left of the primary display. */
        frame: NativeRect;
        /** Where the window's pixels sit inside the fixed output frame, in output pixels. */
        content: NativeRect;
      }
    | { kind: "packet"; ptsUs: number; durationUs: number; keyframe: boolean }
    | { kind: "end"; endUs: number };
  /** config: avcC; packet: length-prefixed AVC access unit; end: empty. */
  payload: Uint8Array;
};
export interface NativeCaptureReader {
  next(): Promise<NativeCaptureFrame | null>;
  ready?(): Promise<void>;
  begin?(atMainMs: number): Promise<void>;
  pause?(atMainMs: number): Promise<void>;
  resume?(atMainMs: number): Promise<void>;
  stop(atMainMs?: number): Promise<void>;
  cancel(): Promise<void>;
}

/** Missing/unknown provenance is always ineligible for an editable overlay. */
export type CursorPixelProvenance = "embedded" | "excluded";
export function canOverlayRecordedCursor(
  capture: { cursorPixels?: CursorPixelProvenance } | null | undefined,
): boolean {
  return capture?.cursorPixels === "excluded";
}

export interface NativeVideoRequest {
  displayId: number;
  width: number;
  height: number;
  frameRate: number;
  videoBitrate: number;
  /** Crop at the source, in display points (origin top-left). Absent: the whole display. */
  sourceRect?: { x: number; y: number; width: number; height: number };
}
/**
 * A window source: the helper records one window at a fixed output size and streams its
 * geometry. `windowId` is the CGWindowID (the number in Electron's `window:<n>:0`). It takes
 * neither `displayId` nor `sourceRect`.
 */
export interface NativeWindowRequest {
  windowId: number;
  width: number;
  height: number;
  frameRate: number;
  videoBitrate: number;
}
export type NativeCaptureRequest = NativeVideoRequest | NativeWindowRequest;
/**
 * What the renderer asks main to open: the encode parameters plus the source it picked.
 * Main resolves `displayId` from `sourceId` and, with an `area`, the helper's `sourceRect`
 * (display points) after validating the area against that display.
 */
export type NativeOpenRequest = Omit<NativeVideoRequest, "displayId" | "sourceRect"> & {
  displayId?: number;
  sourceId?: string;
  area?: RecordingArea | null;
};
export interface NativeCaptureBridge {
  /** `requested`: the renderer's `native-cursor-capture` flag. The main process also
   *  honours `--experimental-native-recording` on its own command line. */
  capability(requested?: boolean): Promise<{
    transportAvailable: boolean;
    recordingReady: false;
    reason: string;
    experimentalRequested?: boolean;
  }>;
  open(request: NativeOpenRequest): Promise<void>;
  begin(atMainMs: number): Promise<void>;
  pause(atMainMs: number): Promise<void>;
  resume(atMainMs: number): Promise<void>;
  next(): Promise<NativeCaptureFrame | null>;
  stop(atMainMs?: number): Promise<void>;
  cancel(): Promise<void>;
}
export const NATIVE_CAPTURE_CHANNELS = {
  capability: "native-capture:capability",
  open: "native-capture:open",
  begin: "native-capture:begin",
  pause: "native-capture:pause",
  resume: "native-capture:resume",
  next: "native-capture:next",
  stop: "native-capture:stop",
  cancel: "native-capture:cancel",
} as const;
