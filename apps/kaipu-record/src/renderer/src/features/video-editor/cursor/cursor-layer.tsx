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
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawn = useRef<CursorFrame | null>(null);
  const at = useMemo(() => prepareCursor(data.track, data.settings), [data.track, data.settings]);
  const trigger = useMemo(
    () => ({ at, path, cameraEnabled, hidden, frame, redactions }),
    [at, path, cameraEnabled, hidden, frame, redactions],
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
      const scale = frame.width / box.width;
      const x = (event.clientX - box.left) * scale - c.x;
      const y = (event.clientY - box.top) * scale - c.y;
      const reach = c.style === "spotlight" ? c.size * 1.25 : c.size;
      const pad = Math.max(8 * scale, c.size * 0.25);
      return c.style === "arrow"
        ? x >= -pad && x <= c.size * 0.65 + pad && y >= -pad && y <= c.size + pad
        : Math.hypot(x, y) <= reach * (c.style === "dot" ? 0.22 : 1) + pad;
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
