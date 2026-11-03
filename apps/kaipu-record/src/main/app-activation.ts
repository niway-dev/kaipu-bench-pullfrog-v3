interface ActivationDeps {
  app: { on(event: "activate" | "did-become-active", listener: () => void): unknown };
  platform: NodeJS.Platform;
  /** Overlay focus also activates the app; it must not restore the window into the shot. */
  captureInProgress(): boolean;
  recordingInProgress(): boolean;
  showMainWindow(): void;
}

/** Dock/relaunch and macOS Cmd+Tab must both reveal the tracked main window. */
export function registerAppActivation(deps: ActivationDeps): void {
  deps.app.on("activate", deps.showMainWindow);
  if (deps.platform === "darwin") {
    deps.app.on("did-become-active", () => {
      if (deps.captureInProgress() || deps.recordingInProgress()) return;
      deps.showMainWindow();
    });
  }
}
