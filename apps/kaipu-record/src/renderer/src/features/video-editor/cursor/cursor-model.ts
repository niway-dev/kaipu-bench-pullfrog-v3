/** Pure, source-time cursor model shared by preview and both export workers. */
import {
  isOnDisplay,
  lastIndexAtOrBefore,
  sampleCursor,
  type CursorTrack,
} from "@shared/cursor-track";
import { canOverlayRecordedCursor, type CursorPixelProvenance } from "@shared/native-capture";
import type { CameraState } from "../zoom/camera-path";
import { cropRect } from "../zoom/camera-path";
import type { Redaction } from "../privacy/redaction";

export interface CursorSettings {
  visible: boolean;
  style: "arrow" | "dot" | "spotlight";
  /** Size in pixels on a 1080-high output; independent of camera magnification. */
  size: number;
  smoothing: number;
  clickEffect: "none" | "circle" | "ripple";
  clickBounce: boolean;
  idleHide: boolean;
}
export const DEFAULT_CURSOR: Readonly<CursorSettings> = Object.freeze({
  visible: true,
  style: "arrow",
  size: 32,
  smoothing: 0,
  clickEffect: "none",
  clickBounce: false,
  idleHide: false,
});
export function parseCursorSettings(raw: unknown): CursorSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CURSOR };
  const r = raw as Record<string, unknown>;
  const num = (key: string, min: number, max: number, fallback: number): number =>
    typeof r[key] === "number" && Number.isFinite(r[key])
      ? Math.max(min, Math.min(max, r[key] as number))
      : fallback;
  return {
    visible: typeof r.visible === "boolean" ? r.visible : true,
    style: r.style === "dot" || r.style === "spotlight" ? r.style : "arrow",
    size: num("size", 16, 96, 32),
    smoothing: num("smoothing", 0, 100, 0),
    clickEffect: r.clickEffect === "circle" || r.clickEffect === "ripple" ? r.clickEffect : "none",
    clickBounce: r.clickBounce === true,
    idleHide: r.idleHide === true,
  };
}
export interface CursorLayerData {
  track: CursorTrack;
  settings: CursorSettings;
}
export function cursorLayerData(
  capture: { cursorPixels?: CursorPixelProvenance } | null | undefined,
  track: CursorTrack | null,
  settings: CursorSettings = DEFAULT_CURSOR,
): CursorLayerData | null {
  return canOverlayRecordedCursor(capture) && track?.t.length ? { track, settings } : null;
}
export interface CursorFrame {
  x: number;
  y: number;
  size: number;
  style: CursorSettings["style"];
  bounce: number;
  click: null | { x: number; y: number; progress: number; effect: "circle" | "ripple" };
}
/** Precompute a causal exponential filter and last movement times ONCE per settings/track.
 * Sampling never depends on playback history, seek direction, frame rate or cut order. */
export function prepareCursor(track: CursorTrack, settings: CursorSettings) {
  const x = track.x.slice(),
    y = track.y.slice(),
    moved = track.t.slice();
  const tau = settings.smoothing * 2;
  let movementAnchor = 0;
  for (let i = 1; i < track.t.length; i++) {
    const discontinuity =
      !isOnDisplay({ x: track.x[i], y: track.y[i] }) ||
      !isOnDisplay({ x: track.x[i - 1], y: track.y[i - 1] });
    const k = tau > 0 && !discontinuity ? 1 - Math.exp(-(track.t[i] - track.t[i - 1]) / tau) : 1;
    x[i] = x[i - 1] + (x[i] - x[i - 1]) * k;
    y[i] = y[i - 1] + (y[i] - y[i - 1]) * k;
    if (
      Math.hypot(track.x[i] - track.x[movementAnchor], track.y[i] - track.y[movementAnchor]) <
      0.0005
    )
      moved[i] = moved[i - 1];
    else movementAnchor = i;
  }
  const filtered = { ...track, x, y };
  const clicks = track.clicksAvailable ? track.clicks : [];
  const clickTimes = clicks.map((c) => c.t);
  return (
    sourceSeconds: number,
    camera: CameraState,
    width: number,
    height: number,
    redactions: Redaction[] = [],
  ): CursorFrame | null => {
    const t = sourceSeconds * 1000;
    if (
      !settings.visible ||
      !track.t.length ||
      t < 0 ||
      (track.truncatedAtMs !== undefined && t >= track.truncatedAtMs)
    )
      return null;
    const raw = sampleCursor(track, t),
      p = sampleCursor(filtered, t);
    if (!raw || !p || !isOnDisplay(raw) || !isOnDisplay(p)) return null;
    const i = lastIndexAtOrBefore(track.t, t);
    const ci = lastIndexAtOrBefore(clickTimes, t);
    const click = ci >= 0 ? clicks[ci] : null;
    const age = click ? t - click.t : Infinity;
    if (settings.idleHide && t - Math.max(moved[Math.max(0, i)], click?.t ?? -Infinity) >= 1500)
      return null;
    const crop = cropRect(camera);
    const project = (point: { x: number; y: number }) => ({
      x: ((point.x - crop.x) / crop.w) * width,
      y: ((point.y - crop.y) / crop.h) * height,
    });
    const at = project(p);
    if (at.x < 0 || at.x > width || at.y < 0 || at.y > height) return null;
    // Privacy wins: suppress the entire layer while a redaction overlaps this source
    // instant. Neither pointer motion nor click locations can disclose hidden content.
    if (redactions.some((r) => sourceSeconds >= r.start && sourceSeconds <= r.end)) return null;
    const effect = settings.clickEffect;
    return {
      ...at,
      size: (settings.size * height) / 1080,
      style: settings.style,
      bounce: settings.clickBounce && age < 240 ? 1 - 0.22 * Math.sin((age / 240) * Math.PI) : 1,
      click:
        click && age < 500 && effect !== "none" && isOnDisplay(click)
          ? { ...project(click), progress: age / 500, effect }
          : null,
    };
  };
}
/** The exact same Canvas2D painter runs in the editor and export. No source pixels read. */
export function drawCursor(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  frame: CursorFrame | null,
): void {
  if (!frame) return;
  ctx.save();
  if (frame.click) {
    const c = frame.click;
    ctx.beginPath();
    ctx.arc(
      c.x,
      c.y,
      frame.size * (c.effect === "ripple" ? 0.5 + c.progress : 0.8),
      0,
      Math.PI * 2,
    );
    ctx.globalAlpha = (1 - c.progress) * 0.65;
    ctx.fillStyle = "#58a6ff";
    ctx.strokeStyle = "#58a6ff";
    ctx.lineWidth = Math.max(1, frame.size / 12);
    if (c.effect === "circle") ctx.fill();
    else ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.translate(frame.x, frame.y);
  ctx.scale(frame.size * frame.bounce, frame.size * frame.bounce);
  ctx.lineWidth = 0.055;
  ctx.strokeStyle = "#18181b";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  if (frame.style === "arrow") {
    ctx.moveTo(0, 0);
    ctx.lineTo(0.06, 0.88);
    ctx.lineTo(0.3, 0.66);
    ctx.lineTo(0.49, 1);
    ctx.lineTo(0.67, 0.9);
    ctx.lineTo(0.48, 0.56);
    ctx.lineTo(0.8, 0.5);
    ctx.closePath();
  } else {
    ctx.arc(0, 0, frame.style === "spotlight" ? 1.25 : 0.22, 0, Math.PI * 2);
    if (frame.style === "spotlight") {
      ctx.fillStyle = "#ffdc58";
      ctx.globalAlpha = 0.45;
    }
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
