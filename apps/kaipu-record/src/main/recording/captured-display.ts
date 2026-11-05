/**
 * Which display a capture source records — the space cursor samples are normalized to.
 * Pure: the caller passes desktopCapturer's `display_id` and `screen.getAllDisplays()`.
 *
 * `pickCapturedDisplay` serves SCREEN sources only. A Chromium `window:` take has no cursor
 * track: Electron cannot read another app's window bounds. A NATIVE window take gets one
 * through `windowCapturedSpace`, from the geometry the helper streams.
 */
import type { RecordingArea } from "@shared/types/ipc";
import type { CapturedDisplay } from "./cursor-tracker";
import type { WindowGeometryLog } from "./window-geometry-log";

export interface DisplayLike {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

export function pickCapturedDisplay(
  sourceId: string,
  /** desktopCapturer source `display_id` ("" or undefined on some platforms). */
  displayId: string | undefined,
  displays: DisplayLike[],
): CapturedDisplay | null {
  if (!sourceId.startsWith("screen:")) return null;
  const byId = displayId ? displays.find((d) => String(d.id) === displayId) : undefined;
  // Some platforms report an empty display_id; with a single display it is unambiguous.
  const display = byId ?? (displays.length === 1 ? displays[0] : undefined);
  if (!display || display.bounds.width <= 0 || display.bounds.height <= 0) return null;
  return {
    id: String(display.id),
    bounds: { ...display.bounds },
    scaleFactor: display.scaleFactor,
  };
}

/** The scale factor of the display holding `point` (global points); the first display, else 1. */
export function displayScaleAt(point: { x: number; y: number }, displays: DisplayLike[]): number {
  const holder = displays.find(
    (d) =>
      point.x >= d.bounds.x &&
      point.x < d.bounds.x + d.bounds.width &&
      point.y >= d.bounds.y &&
      point.y < d.bounds.y + d.bounds.height,
  );
  return (holder ?? displays[0])?.scaleFactor ?? 1;
}

/**
 * The space a native WINDOW take's cursor is normalized to (NIW2-645): the output frame, with
 * the window's geometry in force at each sample. Null for any other source, and until the
 * first geometry has arrived. `bounds` is informational (the latest window frame); the
 * tracker maps through `window`.
 */
export function windowCapturedSpace(
  sourceId: string,
  scaleFactor: number,
  log: WindowGeometryLog,
): CapturedDisplay | null {
  const match = /^window:(\d+):\d+$/.exec(sourceId);
  const latest = log.latest();
  if (!match || !latest) return null;
  return {
    id: `window:${match[1]}`,
    bounds: { ...latest.frame },
    scaleFactor,
    window: log,
  };
}

/**
 * The space an AREA recording's cursor is normalized to (ADR 0030): the area itself, in
 * global DIP, so x/y of 0–1 span the recorded frame and the editor's zoom needs no offset.
 */
export function areaCapturedDisplay(
  display: CapturedDisplay,
  area: RecordingArea,
): CapturedDisplay {
  return {
    id: display.id,
    bounds: {
      x: display.bounds.x + area.rect.x,
      y: display.bounds.y + area.rect.y,
      width: area.rect.width,
      height: area.rect.height,
    },
    scaleFactor: display.scaleFactor,
    region: { displayId: display.id, x: area.rect.x, y: area.rect.y },
  };
}
