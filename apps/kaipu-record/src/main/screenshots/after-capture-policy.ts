import type { CaptureAction } from "@shared/types/screenshot-capture";
import type { ScreenshotCopyMode } from "@shared/types";

/**
 * What main does with a finished capture. Every capture is saved to the vault first;
 * the action only decides what comes after it.
 */
export interface AfterCapture {
  /** `quiet` shows only the preview card; `editor` is kept for the handler's fallbacks. */
  open: "editor" | "quiet";
  /** Whether main also puts the shot on the clipboard. */
  copy: boolean;
}

/**
 * Both actions finish quietly: the vault, the clipboard when asked, and the preview card,
 * without bringing the app forward (ADR 0042). The editor opens only from the card's Edit, or
 * when a shot landed nowhere (`capture-handler.ts`). Capture copies when the copy preference is
 * automatic; Copy always does. Pure: no Electron imports.
 */
export function decideAfterCapture(action: CaptureAction, copy: ScreenshotCopyMode): AfterCapture {
  return { open: "quiet", copy: action === "copy" || copy === "auto" };
}
