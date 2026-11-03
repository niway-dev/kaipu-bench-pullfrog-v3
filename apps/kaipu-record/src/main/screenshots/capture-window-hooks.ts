import type { CaptureEnding, CaptureWindowHooks } from "./capture-handler";

/** The slice of the main `BrowserWindow` the hooks use, so tests can pass a fake. */
export interface CaptureMainWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  hide(): void;
  showInactive(): void;
}

export interface CaptureWindowHooksDeps {
  /** The main window, or null when it was closed (macOS keeps the app alive in the tray). */
  mainWindow(): CaptureMainWindow | null;
  hideCapturePanel(): void;
  /**
   * Hide the previous capture's toast. Only the window: the kept copy-only bytes stay
   * until the capture handler clears them as the new capture starts.
   */
  dismissToast(): void;
  hideCameraBubble(): void;
  restoreCameraBubble(): void;
  /** Show and focus the main window, recreating it when it was closed. */
  showMainWindow(): void;
  /** Bring the whole app to the front (the editor asked for it). */
  bringAppToFront(): void;
}

/**
 * Window orchestration around a capture (owned by main, which holds the windows): every
 * window of ours leaves the screen before the overlay opens, and comes back afterwards
 * the way the capture ended.
 *
 * - `editor`: the renderer reveals the window itself once the editor shows.
 * - `cancelled`: a window that was up comes back, focused, as before the capture.
 * - `quiet`: the main window stays hidden. `showInactive` would raise it in the window
 *   stack even without focus, covering the app where the user wants to paste.
 * - `recording`: the overlay started a take; the window stays hidden (the countdown is drawn
 *   on the chosen region) and comes back when the take stops, like any recording.
 *
 * A window that was hidden stays hidden on every path.
 */
export function createCaptureWindowHooks(deps: CaptureWindowHooksDeps): CaptureWindowHooks {
  /** Whether the main window was visible before the capture, to restore it after. */
  let wasVisible = false;

  const liveWindow = (): CaptureMainWindow | null => {
    const window = deps.mainWindow();
    return window && !window.isDestroyed() ? window : null;
  };

  return {
    beforeCapture: () => {
      const window = liveWindow();
      wasVisible = window?.isVisible() ?? false;
      // Failure: the last quiet capture's toast is always on top and would land in this shot.
      deps.dismissToast();
      deps.hideCapturePanel();
      window?.hide();
      // The bubble is always-on-top and not content-protected (it is meant to be captured
      // by a *recording*), so it would otherwise sit inside the overlay and the shot.
      deps.hideCameraBubble();
    },
    afterCapture: (ending: CaptureEnding) => {
      if (wasVisible && ending === "cancelled") deps.showMainWindow();
      deps.restoreCameraBubble();
    },
    reveal: () => deps.bringAppToFront(),
  };
}
