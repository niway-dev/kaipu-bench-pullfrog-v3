import type { CursorTrack } from "@shared/cursor-track";
export const track: CursorTrack = {
  version: 1,
  display: { id: "1", width: 1920, height: 1080, scaleFactor: 1 },
  anchor: "exact",
  clicksAvailable: true,
  t: [0, 500, 1000, 2000, 3000],
  x: [0.5, 0.6, 0.7, 0.7, 0.7],
  y: [0.5, 0.5, 0.5, 0.5, 0.5],
  clicks: [{ t: 500, x: 0.6, y: 0.5, button: 0 }],
};
