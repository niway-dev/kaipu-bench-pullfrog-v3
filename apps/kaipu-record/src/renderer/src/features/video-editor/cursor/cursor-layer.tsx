import { useMemo, useRef } from "react";
import { useVideoFrameClock } from "../use-video-frame-clock";
import { cameraAt, type CameraPath } from "../zoom/camera-path";
import type { Redaction } from "../privacy/redaction";
import { prepareCursor, drawCursor, type CursorLayerData } from "./cursor-model";

export function CursorLayer({
  data,
  videoRef,
  path,
  cameraEnabled,
  hidden,
  frame,
  redactions,
}: {
  data: CursorLayerData;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  path: CameraPath;
  cameraEnabled: boolean;
  hidden: boolean;
  frame: { width: number; height: number };
  redactions: Redaction[];
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
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
      if (!hidden)
        drawCursor(
          ctx,
          at(
            t,
            cameraEnabled ? cameraAt(path, t) : { cx: 0.5, cy: 0.5, scale: 1 },
            frame.width,
            frame.height,
            redactions,
          ),
        );
    },
    trigger,
  );
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
