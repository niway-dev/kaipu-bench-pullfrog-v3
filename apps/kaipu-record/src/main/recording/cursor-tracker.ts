/**
 * Main-process cursor sampler for ONE recording (one writer session id). Pure-ish:
 * Electron is injected (`CursorTrackerDeps`) so the whole lifecycle is unit-tested.
 *
 * Lifecycle (driven by recording-hub.ts IPC handlers):
 *   start()            recorder called cursorTrackStart — sampling begins at once, so
 *                      the samples before the first frame exist and are trimmed later
 *   setAnchor(t0)      recorder measured video time 0 (main clock)
 *   pause()/resume()   recorder paused/resumed the encoder (main clock)
 *   addClick(button)   click hook fired (doc 03); position = poller's current point
 *   stop() + build()   at recordingFinalize — returns the persisted CursorTrack
 */
import type { CursorButton, CursorTrack } from "@shared/cursor-track";
import { buildCursorTrack } from "./build-cursor-track";
import { type ClockAnchor, closeOpenPause } from "./cursor-clock";
import { CursorSampleBuffer } from "./cursor-sample-buffer";
import type { WindowGeometryLog } from "./window-geometry-log";

/**
 * 8 ms = 125 Hz. `screen.getCursorScreenPoint()` is a synchronous call on the same main
 * thread that serialises the recording's chunk writes, so this rate is a budget, not a
 * free choice — Task 9 measures it against a 5-minute high-quality take and says when to
 * back off to 16 ms (60 Hz), which is still twice the frame rate.
 */
export const CURSOR_SAMPLE_INTERVAL_MS = 8;

export interface CapturedDisplay {
  /** Electron `Display.id` as a string (desktopCapturer's `display_id`). */
  id: string;
  /** DIP, global desktop space — `Display.bounds` (NOT workArea: capture includes the menu bar). */
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  /**
   * An area recording (ADR 0030): `bounds` is then the AREA in global DIP, so samples are
   * normalized to it, and this records the area's origin on its display for the sidecar.
   */
  region?: { displayId: string; x: number; y: number };
  /**
   * A native WINDOW take (NIW2-645): samples are mapped into the output frame through the
   * window geometry in force at each sample's time. `bounds` is then informational.
   */
  window?: WindowGeometryLog;
}

export interface CursorTrackerDeps {
  /** Main-process `performance.now()`. */
  now(): number;
  /** `screen.getCursorScreenPoint()` — DIP, global desktop space. */
  cursorPoint(): { x: number; y: number };
  /** Run `fn` every `ms`; returns a function that stops it. */
  every(ms: number, fn: () => void): () => void;
}

export class CursorTracker {
  private readonly samples = new CursorSampleBuffer();
  private readonly clicks: { t: number; x: number; y: number; button: CursorButton }[] = [];
  private anchor: ClockAnchor | null = null;
  private anchorQuality: "exact" | "estimated" = "estimated";
  private stopTimer: (() => void) | null = null;

  constructor(
    readonly display: CapturedDisplay,
    private readonly deps: CursorTrackerDeps,
  ) {}

  start(): void {
    if (this.stopTimer) return;
    this.sample();
    this.stopTimer = this.deps.every(CURSOR_SAMPLE_INTERVAL_MS, () => this.sample());
  }

  setAnchor(t0MainMs: number, quality: "exact" | "estimated"): void {
    // Pauses recorded before the anchor (impossible in practice) are kept as-is.
    this.anchor = { t0: t0MainMs, pauses: this.anchor?.pauses ?? [] };
    this.anchorQuality = quality;
  }

  pause(atMainMs: number): void {
    const pauses = this.anchor?.pauses ?? [];
    if (pauses.some((p) => p.end === null)) return; // already paused
    this.anchor = {
      t0: this.anchor?.t0 ?? Number.NaN,
      pauses: [...pauses, { start: atMainMs, end: null }],
    };
  }

  resume(atMainMs: number): void {
    if (!this.anchor) return;
    this.anchor = {
      t0: this.anchor.t0,
      pauses: this.anchor.pauses.map((p) =>
        p.end === null ? { start: p.start, end: atMainMs } : p,
      ),
    };
  }

  addClick(button: CursorButton): void {
    if (!this.stopTimer) return;
    const now = this.deps.now();
    const p = this.normalized(this.deps.cursorPoint(), now);
    if (!p) return; // a window take before its first geometry has no mapping
    this.clicks.push({ t: now, x: p.x, y: p.y, button });
  }

  stop(): void {
    this.stopTimer?.();
    this.stopTimer = null;
    this.samples.flush();
  }

  get truncatedAtMs(): number | null {
    return this.samples.truncatedAtMs;
  }

  /**
   * The persisted track, or null when the recorder never sent an anchor.
   * `maxMs` is the recording's duration in ms: this method runs at finalize, well after
   * the last frame, so everything sampled in between has to be cut.
   */
  build(clicksAvailable: boolean, maxMs?: number): CursorTrack | null {
    if (!this.anchor || !Number.isFinite(this.anchor.t0)) return null;
    const display = this.persistedDisplay();
    if (!display) return null;
    const anchor = closeOpenPause(this.anchor, this.deps.now());
    return buildCursorTrack({
      raw: { t: this.samples.t, x: this.samples.x, y: this.samples.y, clicks: this.clicks },
      anchor,
      anchorQuality: this.anchorQuality,
      clicksAvailable,
      maxMs,
      truncatedAtMainMs: this.samples.truncatedAtMs,
      ...(this.display.region ? { region: this.display.region } : {}),
      display,
    });
  }

  /**
   * The sidecar's `display`. A window take stores the output in points (pixels / scale), so
   * the editor's aspect-ratio maths sees the recorded frame; null while the output is unknown.
   */
  private persistedDisplay(): CursorTrack["display"] | null {
    const log = this.display.window;
    if (log) {
      const out = log.output();
      if (!out) return null;
      const scale = this.display.scaleFactor;
      return {
        id: this.display.id,
        width: out.width / scale,
        height: out.height / scale,
        scaleFactor: scale,
      };
    }
    return {
      id: this.display.id,
      width: this.display.bounds.width,
      height: this.display.bounds.height,
      scaleFactor: this.display.scaleFactor,
    };
  }

  private sample(): void {
    const now = this.deps.now();
    const p = this.normalized(this.deps.cursorPoint(), now);
    if (p) this.samples.push(now, p.x, p.y);
  }

  /** Null only for a window take with no geometry (or no output size) in force at `atMs`. */
  private normalized(p: { x: number; y: number }, atMs: number): { x: number; y: number } | null {
    const log = this.display.window;
    if (log) {
      const g = log.at(atMs);
      const out = log.output();
      if (!g || !out) return null;
      // Output pixels: the content rect's offset plus the pointer's offset in the window,
      // scaled by how much the window was shrunk or grown to fit.
      const px = g.content.x + (p.x - g.frame.x) * (g.content.width / g.frame.width);
      const py = g.content.y + (p.y - g.frame.y) * (g.content.height / g.frame.height);
      return { x: px / out.width, y: py / out.height };
    }
    const b = this.display.bounds;
    return { x: (p.x - b.x) / b.width, y: (p.y - b.y) / b.height };
  }
}

/** All live trackers, keyed by the recorder's writer session id. */
export class CursorTrackRegistry {
  private readonly trackers = new Map<string, CursorTracker>();

  constructor(private readonly deps: CursorTrackerDeps) {}

  start(sessionId: string, display: CapturedDisplay): CursorTracker {
    this.discard(sessionId);
    const tracker = new CursorTracker(display, this.deps);
    this.trackers.set(sessionId, tracker);
    tracker.start();
    return tracker;
  }

  get(sessionId: string): CursorTracker | undefined {
    return this.trackers.get(sessionId);
  }

  /** True while any recording is sampling — the click hook runs only then (doc 03). */
  get active(): boolean {
    return this.trackers.size > 0;
  }

  /** Every live tracker — the click hook fans a click out to all of them. */
  all(): CursorTracker[] {
    return [...this.trackers.values()];
  }

  /**
   * Stop and remove; returns the built track (null when never anchored or unknown id).
   * `maxMs` = the finished recording's duration in ms, so the tail sampled while the
   * file was being finalized is cut.
   */
  finish(sessionId: string, clicksAvailable: boolean, maxMs?: number): CursorTrack | null {
    const tracker = this.trackers.get(sessionId);
    if (!tracker) return null;
    tracker.stop();
    this.trackers.delete(sessionId);
    return tracker.build(clicksAvailable, maxMs);
  }

  discard(sessionId: string): void {
    this.trackers.get(sessionId)?.stop();
    this.trackers.delete(sessionId);
  }

  discardAll(): void {
    for (const id of [...this.trackers.keys()]) this.discard(id);
  }
}
