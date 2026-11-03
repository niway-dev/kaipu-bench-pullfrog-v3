import { useEffect, useMemo, useRef } from "react";
import { useVideoFrameClock } from "../use-video-frame-clock";
import { cameraAt, type CameraPath } from "../zoom/camera-path";
import type { Redaction } from "../privacy/redaction";
import { prepareCursor, drawCursor, type CursorFrame, type CursorLayerData } from "./cursor-model";

export function CursorLayer({
  data,
  videoRef,
  path,
  cameraEnabled,
  hidden,
  frame,
  redactions,
  onSelect,
  selected = false,
}: {
  data: CursorLayerData;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  path: CameraPath;
  cameraEnabled: boolean;
  hidden: boolean;
  frame: { width: number; height: number };
  redactions: Redaction[];
  /** Clicking the drawn pointer opens its settings. Omitted while a drawing tool is active. */
  onSelect?: () => void;
  /** Its settings are open: outline it in the preview so it reads as the selection. */
  selected?: boolean;
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawn = useRef<CursorFrame | null>(null);
  const at = useMemo(() => prepareCursor(data.track, data.settings), [data.track, data.settings]);
  const trigger = useMemo(
    () => ({ at, path, cameraEnabled, hidden, frame, redactions, selected }),
    [at, path, cameraEnabled, hidden, frame, redactions, selected],
  );
  useVideoFrameClock(
    videoRef,
    (t) => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, frame.width, frame.height);
      drawn.current = hidden
        ? null
        : at(
            t,
            cameraEnabled ? cameraAt(path, t) : { cx: 0.5, cy: 0.5, scale: 1 },
            frame.width,
            frame.height,
            redactions,
          );
      drawCursor(ctx, drawn.current);
      // Preview only: the export never calls this layer, so the outline cannot leak.
      if (selected && drawn.current) drawSelection(ctx, drawn.current, canvas.current);
    },
    trigger,
  );
  // The canvas never takes pointer events (the annotation layer below must keep them), so
  // the stage listens in the capture phase and claims only presses on the drawn pointer.
  useEffect(() => {
    const host = canvas.current?.parentElement;
    if (!host || !onSelect) return;
    const hit = (event: PointerEvent): boolean => {
      const c = drawn.current;
      const box = canvas.current?.getBoundingClientRect();
      if (!c || !box || box.width === 0) return false;
      if (!pressReachesBackground(event.target, canvas.current?.previousElementSibling))
        return false;
      const scale = frame.width / box.width;
      return hitsCursor(
        c,
        (event.clientX - box.left) * scale,
        (event.clientY - box.top) * scale,
        Math.max(8 * scale, c.size * 0.25),
      );
    };
    let hovering = false;
    const move = (event: PointerEvent): void => {
      const over = hit(event);
      if (over === hovering) return;
      hovering = over;
      host.style.cursor = over ? "pointer" : "";
    };
    // The press that selects the pointer must not also reach the stage's own click
    // (play/pause on the background).
    let swallowClick = false;
    const down = (event: PointerEvent): void => {
      // A press released off the stage never fires `click`; never carry its swallow over.
      swallowClick = false;
      if (event.button !== 0 || !hit(event)) return;
      event.preventDefault();
      event.stopPropagation();
      swallowClick = true;
      onSelect();
    };
    const click = (event: MouseEvent): void => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerdown", down, true);
    host.addEventListener("click", click, true);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerdown", down, true);
      host.removeEventListener("click", click, true);
      host.style.cursor = "";
    };
  }, [onSelect, frame.width]);
  return (
    <canvas
      ref={canvas}
      width={frame.width}
      height={frame.height}
      aria-hidden="true"
      data-testid="cursor-layer"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

/** A rounded accent outline around the drawn pointer, sized in screen pixels. */
function drawSelection(
  ctx: CanvasRenderingContext2D,
  c: CursorFrame,
  el: HTMLCanvasElement | null,
): void {
  const box = el?.getBoundingClientRect();
  const px = box && box.width > 0 ? el!.width / box.width : 1; // canvas px per screen px
  const pad = 6 * px;
  const [left, top, right, bottom] =
    c.style === "arrow"
      ? [c.x, c.y, c.x + c.size * 0.65, c.y + c.size]
      : (() => {
          const r = c.size * (c.style === "spotlight" ? 1.25 : 0.22);
          return [c.x - r, c.y - r, c.x + r, c.y + r];
        })();
  const accent = el ? getComputedStyle(el).getPropertyValue("--accent-primary").trim() : "";
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left - pad, top - pad, right - left + 2 * pad, bottom - top + 2 * pad, 6 * px);
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = accent || "#f43f5e";
  ctx.setLineDash([5 * px, 3 * px]);
  ctx.stroke();
  ctx.restore();
}

/** Whether a press at (x, y), in canvas pixels, lands on the drawn pointer (plus `pad`). */
export function hitsCursor(c: CursorFrame, x: number, y: number, pad: number): boolean {
  const dx = x - c.x,
    dy = y - c.y;
  if (c.style === "arrow")
    return dx >= -pad && dx <= c.size * 0.65 + pad && dy >= -pad && dy <= c.size + pad;
  const radius = c.size * (c.style === "spotlight" ? 1.25 : 0.22);
  return Math.hypot(dx, dy) <= radius + pad;
}

/**
 * The pointer may claim a press only on the footage itself: the video, a layer laid over
 * it, or the empty space of the annotation canvas. Anything with its own handling wins —
 * an annotation shape or text box (inside `content`), and the camera box, region editor,
 * webcam bubble and buttons (siblings after the cursor canvas, outside `content`).
 */
export function pressReachesBackground(
  target: EventTarget | null,
  content: Element | null | undefined,
): boolean {
  if (!(target instanceof Element) || !content?.contains(target)) return false;
  if (target instanceof SVGElement && !(target instanceof SVGSVGElement)) return false;
  return target.closest("input, textarea, button, [contenteditable]") === null;
}
