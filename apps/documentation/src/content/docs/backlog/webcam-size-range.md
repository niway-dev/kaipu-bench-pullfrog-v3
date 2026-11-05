---
title: Webcam bubble size range (editor)
description: Widen the editor's webcam bubble Size to 12-90% of the frame height, keep the label at 10-90%, and fade the zoom shrink out at large sizes. NIW2-635.
---

# Webcam bubble size range (editor)

> **Status: 🟡 In progress.** Ticket NIW2-635, branch `feature/niw2-635-webcam-size-range`.
> Editor only: the floating camera bubble shown while recording does not change.

## Why

The owner found the 60% maximum "is nothing": a bubble can never be the main subject of a
frame. A product second opinion recommended a linear height range of 0.12 to 0.90, and fading
the zoom shrink at large sizes. Without the fade, a 90% bubble shrinks to 70% inside a 2x zoom
and still renders about 4.6x the area seen at 60% under the same zoom. The label stays 10-90%,
the owner's wording.

## Contract

`size` is the bubble HEIGHT as a fraction of the output frame height; width follows the shape
and is capped by the frame (`webcamRect`).

1. Stored range: `size` in [0.12, 0.90], linear. Default stays 0.22.
2. The inspector slider moves linearly over the stored size. Its label is
   `round(10 + (size - 0.12) / 0.78 * 80)` percent, so 0.12 shows 10% and 0.90 shows 90%.
   This is a display mapping only; the stored value is unchanged.
3. The zoom shrink fades out at large sizes. Weight `w = clamp((0.90 - size) / (0.90 - 0.42), 0, 1)`,
   effective factor `1 - (1 - factorToday) * w`. Sizes up to 0.42 behave exactly as today;
   size 0.90 never shrinks. Preview and export share `webcamRect`, so they stay identical.
4. Sizes below 0.12 clamp up to 0.12 when loaded or patched (existing projects may change;
   the owner accepted this). Sizes above 0.90 clamp down.
5. Not shared with the recorder: `WEBCAM_LIMITS` is only used by the editor, and the recorder's
   camera bubble keeps its own limits.
