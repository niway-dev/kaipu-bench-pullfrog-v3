/**
 * The geometry a native WINDOW take streams from the helper, kept in time order so the
 * cursor tracker can ask which one was in force when a sample was taken (NIW2-645).
 *
 * Times are main-clock ms (the session stamps `atMainMs` on every geometry frame).
 * `at(t)` returns null before the first geometry: there is no mapping then, and the tracker
 * drops that sample.
 */
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

export class WindowGeometryLog {
  private readonly entries: WindowGeometry[] = [];
  private outputSize: { width: number; height: number } | null = null;

  get size(): number {
    return this.entries.length;
  }

  push(g: WindowGeometry): void {
    let i = this.entries.length;
    while (i > 0 && this.entries[i - 1].atMs > g.atMs) i--;
    const before = this.entries[i - 1];
    // A repeat of what is already in force adds nothing.
    if (before && sameRect(before.frame, g.frame) && sameRect(before.content, g.content)) return;
    this.entries.splice(i, 0, g);
  }

  /** The geometry in force at `tMs`, or null before the first one. */
  at(tMs: number): WindowGeometry | null {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].atMs <= tMs) return this.entries[i];
    }
    return null;
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
}
