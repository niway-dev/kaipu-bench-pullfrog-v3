import { BrowserWindow, ipcMain, screen } from "electron";
import type { BrowserWindowConstructorOptions, Rectangle } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { IPC_CHANNELS } from "@shared/types/ipc";
import {
  isCaptureToastAction,
  type CaptureToastAction,
  type CaptureToastPayload,
  type CaptureToastTimer,
} from "@shared/types/screenshot-capture";
import {
  PREVIEW_WINDOW_PADDING,
  previewCardSize,
  type PreviewCardSize,
} from "@shared/capture-preview-layout";
import type { KeptQuietCapture, QuietCapture } from "./last-quiet-capture";
import type { SaveScreenshotMeta } from "./screenshot-save";

/** Gap between the card (not its window) and the work area's top and right edges. */
export const TOAST_MARGIN = 18;
/**
 * The card hides itself this long after it appears, unless the pointer is over it (spec
 * decision 8: Capture no longer opens the editor, so the card is where Edit is).
 */
export const TOAST_AUTO_HIDE_MS = 10_000;

/** What `show` takes: the payload the card renders, plus the display the shot came from. */
export type CaptureToastShowRequest = CaptureToastPayload & { displayId: number };

/** The slice of `BrowserWindow` the toast uses, so tests can pass a fake. */
export interface ToastWindow {
  readonly webContents: { send(channel: string, payload: unknown): void };
  setAlwaysOnTop(flag: boolean, level: "floating"): void;
  setContentProtection(enable: boolean): void;
  setVisibleOnAllWorkspaces(
    visible: boolean,
    options: { visibleOnFullScreen: boolean; skipTransformProcessType: boolean },
  ): void;
  setBounds(bounds: Rectangle): void;
  showInactive(): void;
  hide(): void;
  destroy(): void;
  isDestroyed(): boolean;
  on(event: "closed", listener: () => void): void;
}

type IpcListener = (event: { sender: unknown }, payload?: unknown) => void;

export interface CaptureToastDeps {
  createWindow(options: BrowserWindowConstructorOptions): ToastWindow;
  /** Load `?window=capture-toast` into the window. */
  load(window: ToastWindow): void;
  ipc: { on(channel: string, listener: IpcListener): void };
  screen: {
    getAllDisplays(): Array<{ id: number; workArea: Rectangle }>;
    getPrimaryDisplay(): { id: number; workArea: Rectangle };
  };
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  platform: NodeJS.Platform;
  /** Hand the copy-only capture's bytes to one consumer (`takeLastQuietCapture`). */
  takeQuietCapture(): QuietCapture | null;
  /** Read the kept bytes without freeing them, with their capture sequence (`peekLastQuietCapture`). */
  peekQuietCapture(): KeptQuietCapture | null;
  /** Free the kept bytes if they still belong to capture `of` (`releaseLastQuietCapture`). */
  releaseQuietCapture(of: number): void;
  /** The user's Save to Library (`saveFromToast`); resolves the new item's id. */
  /** Writes into `workspaceId` only, and only while it is active; throws otherwise. */
  saveToVault(png: Buffer, title: string, workspaceId: string | null): Promise<{ id: string }>;
  /** Title of the saved shot (`screenshotTitle()`). */
  title(): string;
  /** Show a saved item in the main window (editor or Library page) and reveal it. */
  openSaved(target: "editor" | "library", id: string): void;
  /** Open a copy-only capture's bytes in the main window's editor and reveal it. */
  openQuietCapture(capture: QuietCapture): void;
  /** Show a saved item's file in Finder / Explorer. */
  revealSaved(id: string): Promise<void>;
  /** Put a saved item's current file on the clipboard; rejects when it cannot be read. */
  copySaved(id: string): Promise<void>;
  /** Put a copy-only capture's kept bytes on the clipboard. */
  copyBytes(png: Buffer): void;
}

/**
 * The window for a card of `size`, with the card `TOAST_MARGIN` in from the work area's top and
 * right edges (the window's transparent padding sits inside that margin). Clamped to the work
 * area's left edge, so a display narrower than the card (or one left of the primary, whose x is
 * negative) still shows all of it that fits, never a sliver off screen.
 */
export function toastBounds(workArea: Rectangle, size: PreviewCardSize): Rectangle {
  const inset = TOAST_MARGIN - PREVIEW_WINDOW_PADDING;
  const right = workArea.x + workArea.width - size.windowWidth - inset;
  return {
    x: Math.round(Math.max(workArea.x, right)),
    y: Math.round(workArea.y + inset),
    width: size.windowWidth,
    height: size.windowHeight,
  };
}

/**
 * The capture preview card (ADR 0042, spec 2026-11-02): one frameless, always-on-top window at
 * the top-right of the display a quiet capture came from, sized to the shot. The image is the
 * card; it shows whether the shot was saved and copied, and offers Edit, Copy, Reveal (or Save
 * after a failed write) and Close. It is the one window allowed on screen while the main
 * window stays hidden after a capture, so it never activates the app (`focusable: false`,
 * `showInactive`).
 *
 * A second capture re-targets the same window (failure 6). Like the tray panel, it joins
 * every Space, full-screen ones included, only while shown: kept on while hidden, that
 * membership blanks the app's own menu bar over a full-screen Kaipu window.
 */
export class CaptureToastWindow {
  private window: ToastWindow | null = null;
  /** The toast renderer subscribed to `screenshot:toast-show`; sends before that are lost. */
  private rendererReady = false;
  private payload: CaptureToastPayload | null = null;
  private bounds: Rectangle | null = null;
  /** Bumped on every `show`, so a Save that finishes late cannot repaint a newer toast. */
  private generation = 0;
  private timer: unknown = null;
  private paused = false;
  /** The pointer is over the card (last `screenshot:toast-hover`); reset when it hides. */
  private pointerInside = false;
  /** The toast generation whose Save is writing; a newer toast's Save is never blocked by it. */
  private savingGeneration: number | null = null;
  /** Edit was pressed while that generation's Save was writing: it runs when the write ends. */
  private annotateAfterSave: number | null = null;
  /** `destroy()` ran: the app is quitting, so no window is created again. */
  private disposed = false;

  constructor(private readonly deps: CaptureToastDeps) {
    deps.ipc.on(IPC_CHANNELS.screenshotToastReady, (event) => {
      if (!this.isOwnSender(event.sender)) return;
      this.rendererReady = true;
      this.present();
      // The card is on screen only now: the 6 s count from here, not from `show`.
      if (this.payload) this.restartTimer();
    });
    deps.ipc.on(IPC_CHANNELS.screenshotToastHover, (event, payload) => {
      if (!this.isOwnSender(event.sender)) return;
      const paused = (payload as { paused?: unknown } | undefined)?.paused;
      if (paused === true) {
        this.pointerInside = true;
        this.pause();
      } else if (paused === false) {
        this.pointerInside = false;
        this.resume();
      }
    });
    deps.ipc.on(IPC_CHANNELS.screenshotToastAction, (event, payload) => {
      if (!this.isOwnSender(event.sender)) return;
      const action = (payload as { action?: unknown } | undefined)?.action;
      if (isCaptureToastAction(action)) this.act(action);
    });
  }

  /**
   * Show `request` on its display (re-targeting an open toast) and restart the 6 s: from now
   * when the renderer is up, else from when it reports ready. A pointer resting on the card
   * keeps holding it through the re-target.
   */
  show(request: CaptureToastShowRequest): void {
    if (this.disposed) return;
    const { displayId, ...payload } = request;
    this.generation += 1;
    this.annotateAfterSave = null;
    this.payload = payload;
    this.bounds = toastBounds(
      this.workAreaOf(displayId),
      previewCardSize(payload.width, payload.height),
    );
    this.paused = this.pointerInside;
    this.ensureWindow();
    this.present();
    if (this.rendererReady) this.restartTimer();
    else this.stopTimer();
  }

  /** The pointer is over the card: hold the auto-hide. */
  pause(): void {
    this.paused = true;
    this.stopTimer();
  }

  /** The pointer left the card: a full 6 s again. */
  resume(): void {
    // An Edit waiting on the Save holds the card until the write ends.
    if (!this.payload || this.annotateAfterSave === this.generation) return;
    this.paused = false;
    this.restartTimer();
  }

  /**
   * Hide the toast. The kept copy-only bytes stay: only a new capture, Annotate or a Save that
   * reached the vault frees them. An Edit waiting on a Save is dropped with the card.
   */
  dismiss(): void {
    this.stopTimer();
    this.payload = null;
    this.annotateAfterSave = null;
    // Hidden under a resting pointer, the card never reports it left.
    this.pointerInside = false;
    this.paused = false;
    if (!this.window || this.window.isDestroyed()) return;
    this.window.hide();
    this.setSpaceBehavior(false);
  }

  /** Quit: dismiss, drop the window for good (no `beforeunload` round trip), never show again. */
  destroy(): void {
    this.disposed = true;
    this.dismiss();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }

  private act(action: CaptureToastAction): void {
    const payload = this.payload;
    if (!payload) return;
    switch (action) {
      case "dismiss":
        this.dismiss();
        return;
      case "edit": {
        if (payload.saved) {
          this.deps.openSaved("editor", payload.saved.id);
        } else if (this.savingGeneration === this.generation) {
          // Save is writing this very shot: open the vault item it is about to produce (one
          // item, failure 4), or the bytes if the write fails. The toast stays until then.
          this.annotateAfterSave = this.generation;
          this.stopTimer();
          return;
        } else {
          // Exactly once: the bytes leave the store as they are handed over.
          const capture = this.deps.takeQuietCapture();
          if (!capture) return;
          this.deps.openQuietCapture(capture);
        }
        this.dismiss();
        return;
      }
      case "reveal":
        if (!payload.saved) return;
        void this.deps
          .revealSaved(payload.saved.id)
          .catch((error) => console.error("screenshot toast reveal failed", error));
        return;
      case "copy":
        void this.copy(payload);
        return;
      case "save":
        void this.save(payload);
        return;
    }
  }

  /**
   * Copy from the card: a saved shot's file as it is now (read by id at press time, so a rename
   * or an edit since is followed), else the kept copy-only bytes (peeked, so Edit and Save keep
   * working). The card then reads Copied; a newer card is never repainted by a late copy.
   */
  private async copy(payload: CaptureToastPayload): Promise<void> {
    const generation = this.generation;
    try {
      if (payload.saved) {
        await this.deps.copySaved(payload.saved.id);
      } else {
        const kept = this.deps.peekQuietCapture();
        if (!kept) return;
        this.deps.copyBytes(kept.capture.png);
      }
    } catch (error) {
      console.error("screenshot toast copy failed", error);
      return;
    }
    if (generation !== this.generation || !this.payload) return;
    this.payload = { ...this.payload, copied: true };
    this.send(this.payload);
  }

  /**
   * Save on a card whose vault write failed: one vault write, then the card reads Saved. The
   * bytes are read, not taken, so Edit keeps working while the write runs; they are freed only
   * once the vault has them, and only if no capture started since (its sequence).
   */
  private async save(payload: CaptureToastPayload): Promise<void> {
    const generation = this.generation;
    if (payload.saved || this.savingGeneration === generation) return;
    const kept = this.deps.peekQuietCapture();
    if (!kept) return;
    this.savingGeneration = generation;
    try {
      // The workspace the capture started in: after a switch this writes nothing (the switch
      // also dismisses this toast and drops the bytes, so a late click finds nothing to save).
      const saved = await this.deps.saveToVault(
        kept.capture.png,
        this.deps.title(),
        kept.capture.workspaceId,
      );
      this.deps.releaseQuietCapture(kept.sequence);
      // A newer capture replaced this toast while the write ran: its card stays.
      if (generation !== this.generation) return;
      const next = { ...payload, saved: { id: saved.id } };
      if (this.payload) this.payload = { ...this.payload, saved: { id: saved.id } };
      this.send(this.payload ?? next);
      if (this.annotateAfterSave === generation) {
        this.deps.openSaved("editor", saved.id);
        this.dismiss();
      }
    } catch (error) {
      console.error("screenshot toast save failed", error);
      // Nothing was taken, so there is nothing to put back. An Annotate that waited gets the
      // bytes, if they are still this capture's (a capture that started since owns the store).
      if (generation !== this.generation || this.annotateAfterSave !== generation) return;
      if (this.deps.peekQuietCapture()?.sequence !== kept.sequence) return;
      const capture = this.deps.takeQuietCapture();
      if (capture) this.deps.openQuietCapture(capture);
      this.dismiss();
    } finally {
      if (this.savingGeneration === generation) this.savingGeneration = null;
      if (this.annotateAfterSave === generation) this.annotateAfterSave = null;
    }
  }

  private ensureWindow(): void {
    if (this.window && !this.window.isDestroyed()) return;
    this.rendererReady = false;
    // Resized to each shot by `present`; this is a 16:10 shot's card until then.
    const initial = previewCardSize(16, 10);
    const window = this.deps.createWindow({
      width: initial.windowWidth,
      height: initial.windowHeight,
      // macOS: a panel is what can float over a full-screen app (hub page
      // desktop/floating-windows-over-full-screen).
      ...(this.deps.platform === "darwin" ? { type: "panel" } : {}),
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      // Never takes focus, so showing it never brings the app (or its main window) forward.
      focusable: false,
      // The first click on a window of an inactive app lands on the button.
      acceptFirstMouse: true,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
      },
    });
    window.setAlwaysOnTop(true, "floating");
    // Second guard behind `beforeCapture` dismissing it: excluded from `screencapture` and
    // `desktopCapturer`, so a toast still on screen never lands in the next shot.
    window.setContentProtection(true);
    window.on("closed", () => {
      if (this.window !== window) return;
      this.window = null;
      this.rendererReady = false;
    });
    this.window = window;
    this.deps.load(window);
  }

  /** Paint and show the current payload, once the renderer can receive it. */
  private present(): void {
    const window = this.window;
    if (!window || window.isDestroyed() || !this.rendererReady || !this.payload) return;
    if (this.bounds) window.setBounds(this.bounds);
    this.send(this.payload);
    this.setSpaceBehavior(true);
    window.showInactive();
  }

  private send(payload: CaptureToastPayload): void {
    if (!this.window || this.window.isDestroyed() || !this.rendererReady) return;
    this.window.webContents.send(IPC_CHANNELS.screenshotToastShow, payload);
  }

  private restartTimer(): void {
    this.stopTimer();
    if (this.paused) return;
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      this.dismiss();
    }, TOAST_AUTO_HIDE_MS);
    this.sendTimer({ remainingMs: TOAST_AUTO_HIDE_MS });
  }

  private stopTimer(): void {
    // Sent even with no timer running: the bar freezes whatever it was showing.
    this.sendTimer({ remainingMs: null });
    if (this.timer === null) return;
    this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  /** The card's bar mirrors main's timer; main stays the one that hides the card. */
  private sendTimer(timer: CaptureToastTimer): void {
    if (!this.window || this.window.isDestroyed() || !this.rendererReady) return;
    this.window.webContents.send(IPC_CHANNELS.screenshotToastTimer, timer);
  }

  /** Join every Space, full-screen ones included, while shown; leave them when hidden. */
  private setSpaceBehavior(open: boolean): void {
    if (this.deps.platform !== "darwin" || !this.window || this.window.isDestroyed()) return;
    this.window.setVisibleOnAllWorkspaces(open, {
      visibleOnFullScreen: open,
      skipTransformProcessType: true,
    });
  }

  private workAreaOf(displayId: number): Rectangle {
    const display =
      this.deps.screen.getAllDisplays().find((candidate) => candidate.id === displayId) ??
      this.deps.screen.getPrimaryDisplay();
    return display.workArea;
  }

  private isOwnSender(sender: unknown): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && sender === this.window.webContents);
  }
}

/** The app side of the toast: what index.ts provides (the main window and the vault). */
export type CaptureToastAppDeps = Pick<
  CaptureToastDeps,
  | "takeQuietCapture"
  | "peekQuietCapture"
  | "releaseQuietCapture"
  | "saveToVault"
  | "title"
  | "openSaved"
  | "openQuietCapture"
  | "revealSaved"
  | "copySaved"
  | "copyBytes"
>;

/**
 * The toast's Save to Library as a vault write. `manual: false`, like the capture's auto-save:
 * a manual save stamps `editorSavedAt`, which puts the shot on the Editor home's Continue
 * list, and the editor never opened this shot.
 */
export function saveFromToast(
  save: (
    workspaceId: string | null,
    png: Buffer,
    meta: SaveScreenshotMeta,
  ) => Promise<{ id: string }>,
): CaptureToastDeps["saveToVault"] {
  return async (png, title, workspaceId) => {
    const saved = await save(workspaceId, png, { title, manual: false });
    return { id: saved.id };
  };
}

/** The production toast: real `BrowserWindow`, `screen`, `ipcMain` and timers. */
export function createCaptureToastWindow(app: CaptureToastAppDeps): CaptureToastWindow {
  return new CaptureToastWindow({
    ...app,
    createWindow: (options) => new BrowserWindow(options),
    load: (window) => {
      const browserWindow = window as BrowserWindow;
      if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        void browserWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/?window=capture-toast`);
      } else {
        void browserWindow.loadFile(join(__dirname, "../renderer/index.html"), {
          search: "?window=capture-toast",
        });
      }
    },
    ipc: ipcMain,
    screen: {
      getAllDisplays: () => screen.getAllDisplays(),
      getPrimaryDisplay: () => screen.getPrimaryDisplay(),
    },
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    platform: process.platform,
  });
}
