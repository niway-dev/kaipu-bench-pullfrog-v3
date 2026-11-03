import type { CaptureAction } from "@shared/types/screenshot-capture";
import type { ScreenshotAfterCapture, ScreenshotCopyMode } from "@shared/types";

/**
 * What main does with a finished capture. Every capture is saved to the vault first;
 * the action only decides what comes after it.
 */
export interface AfterCapture {
  /** `quiet` shows a preview or Copy confirmation; `editor` opens the saved capture. */
  open: "editor" | "quiet";
  /** Whether main also puts the shot on the clipboard. */
  copy: boolean;
}

/**
 * Capture uses the destination preference; explicit Copy always stays quiet. Capture
 * copies only in automatic mode, while Copy always does. Pure: no Electron imports.
 */
export function decideAfterCapture(
  action: CaptureAction,
  copy: ScreenshotCopyMode,
  afterCapture: ScreenshotAfterCapture = "preview",
): AfterCapture {
  return {
    open: action === "capture" && afterCapture === "editor" ? "editor" : "quiet",
    copy: action === "copy" || copy === "auto",
  };
}
