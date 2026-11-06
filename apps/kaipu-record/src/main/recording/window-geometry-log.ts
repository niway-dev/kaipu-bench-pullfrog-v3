/**
 * The geometry a native WINDOW take streams from the helper, kept in time order so the
 * cursor tracker can ask which one was in force at a sample's time (NIW2-645).
 *
 * Times are main-clock ms (the session stamps `atMainMs` on every geometry frame). `at(t)`
 * returns null before the first geometry: there is no mapping then, and the tracker drops
 * that sample. The log is filled while the take runs and read once, when the track is built.
 */
import type { NativeCaptureFrame } from "../../shared/native-capture";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowGeometry {
  /** Main-clock ms when the helper observed this geometry. */
  atMs: number;
  /** The window in global screen points (origin top-left of the primary display). */
  frame: Rect;
  /** Where the window's pixels sit inside the output, in output pixels. */
  content: Rect;
}

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const sameGeometry = (a: WindowGeometry, b: WindowGeometry): boolean =>
  sameRect(a.frame, b.frame) && sameRect(a.content, b.content);

export class WindowGeometryLog {
  private entries: WindowGeometry[] = [];
  private outputSize: { width: number; height: number } | null = null;
  private scale: number | null = null;

  get size(): number {
    return this.entries.length;
  }

  /** Insert in time order. A repeat of the neighbour before it adds nothing. */
  push(g: WindowGeometry): void {
    let i = this.entries.length;
    while (i > 0 && this.entries[i - 1].atMs > g.atMs) i--;
    const before = this.entries[i - 1];
    if (before && sameGeometry(before, g)) return;
    // Arrived late and equal to what follows: the change really happened at `g.atMs`, so
    // the later copy goes and this one takes its place.
    const after = this.entries[i];
    if (after && sameGeometry(after, g)) this.entries.splice(i, 1);
    this.entries.splice(i, 0, g);
  }

  /** The geometry in force at `tMs`, or null before the first one. */
  at(tMs: number): WindowGeometry | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].atMs <= tMs) return this.entries[i];
    }
    return null;
  }

  /** All entries, oldest first, for a caller that walks them once (do not mutate). */
  all(): readonly WindowGeometry[] {
    return this.entries;
  }

  /** Geometry changes with `fromMs < atMs < toMs`, oldest first. */
  between(fromMs: number, toMs: number): WindowGeometry[] {
    return this.entries.filter((g) => g.atMs > fromMs && g.atMs < toMs);
  }

  latest(): WindowGeometry | null {
    return this.entries.at(-1) ?? null;
  }

  /** The fixed output frame size in pixels, known once the helper's `config` arrives. */
  setOutput(size: { width: number; height: number }): void {
    this.outputSize = { width: size.width, height: size.height };
  }

  output(): { width: number; height: number } | null {
    return this.outputSize;
  }

  /** The scale factor of the display the window was on at the first geometry. */
  setScaleFactor(scale: number): void {
    this.scale = scale;
  }

  scaleFactor(): number | null {
    return this.scale;
  }

  /** Forget everything: a new native session is opening for the same take. */
  reset(): void {
    this.entries = [];
    this.outputSize = null;
    this.scale = null;
  }
}

/** Feed one frame from a native session into the log (geometry and config matter). */
export function feedWindowLog(log: WindowGeometryLog, frame: NativeCaptureFrame): void {
  const h = frame.header;
  if (h.kind === "geometry" && h.atMainMs !== undefined)
    log.push({ atMs: h.atMainMs, frame: h.frame, content: h.content });
  else if (h.kind === "config") log.setOutput({ width: h.width, height: h.height });
}
