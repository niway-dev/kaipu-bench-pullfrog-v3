---
title: Cursor-free capture diagnostic
description: Packaged Electron measurement harness for cursor exclusion, loopback audio and screen permissions.
---

**Status: 🟡 In progress — diagnostic implemented; packaged measurements pending.**

This implements the first measurement slice of the cursor styling plan from PR #241,
`2026-10-06-cursor-styling-research.md` at
`67e4b03e1bb8751aa6004b0b6ad2dffc469501a6`. NIW2-156 acceptance criteria were unavailable;
this is not a claim that the issue is complete.

Normal capture is unchanged. An explicit `--cursor-capture-diagnostic` launch flag opens
an isolated, sandboxed window before workspace initialization. Its non-persistent Electron
session installs `setDisplayMediaRequestHandler` with the system picker disabled and grants
only sources enumerated by main to that window's main frame. There is no preload, app IPC,
recording-library write or cursor overlay. Closing the window exits the diagnostic process.

## Run the packaged measurement

1. Quit any running Kaipu instance (the app retains its normal single-instance lock).
2. Build through the normal macOS packaging path, including native dependency rebuilding
   and signing: `bun run --cwd apps/kaipu-record build:mac`. Use the generated `.app` path
   from that command. Do not substitute a development run for packaged evidence.
3. Launch the executable directly, passing the flag:

   ```sh
   "/path/to/Kaipu Record.app/Contents/MacOS/Kaipu Record" --cursor-capture-diagnostic
   ```

4. Select a display. Play recognizable system audio. Choose **Current legacy baseline**,
   then **Record 8 seconds**. Move the pointer over text and buttons on the selected source.
   The baseline requests loopback alongside video and, like the current recorder, falls back
   to video-only on rejection; the report retains the audio failure.
5. Save both WebM and JSON using the links. Repeat with **cursor always** and **cursor never**
   on the same source and audio workload. Repeat for window capture.
6. Play each saved file with sound enabled. The diagnostic's live monitor is muted to avoid
   feedback. Inspect cursor pixels while moving and stationary, including arrow, I-beam and
   hand transitions. Note audible system audio separately from audio-track presence.
7. Repeat after denying screen permission, then after granting it and restarting. Record
   which prompt appeared, its wording and whether restart was necessary. The JSON records
   permission status **before acquisition**, not the final permission state.

Each JSON includes app/package/runtime versions, architecture, selected source ID,
requested path, supported constraints (display-media paths), track settings and constraints,
acquisition time, audio-track count, encoded duration/size, and errors. These files can contain
OS error details and source identifiers; inspect before sharing. Videos contain the selected
screen/window and system audio. Save evidence outside Git.

A reported `cursor: never` is not proof of cursor-free pixels. `cursorFree`, `cursorPixels`
and `audibleSystemAudio` remain unverified/not inspected in generated reports deliberately.
Record the visual/audible verdict alongside the original artifacts. A failed request is
retained as an error report; the display-media experiment does not silently switch paths.

## Validation and limits

The automated checks exercise main-frame/source authorization, explicit audio selection,
HTML data escaping, runnable inline JavaScript, actual diagnostic capture request arguments,
report generation and track cleanup after encoding failure. They use fakes and do not prove
OS capture behavior. The diagnostic uses MediaRecorder for a self-contained WebM artifact;
it does not measure mediabunny integration, encoder quality or CPU parity. Its 30 fps request
and unspecified resolution are a capture-path probe, not the production recorder's full
resolution/bitrate configuration.

Packaged launch, downloads, cursor pixels, permission prompts, audible loopback and CPU
remain manual evidence gaps. No ScreenCaptureKit helper or build/signing integration exists
in this slice. Existing `.cursor.json` data, default baked cursor recordings and editor
controls are unchanged.

## Next implementation slice

Complete the packaged comparison first. If cursor pixels remain with `never`, add an
explicitly enabled ScreenCaptureKit helper (`showsCursor = false`) with lifecycle/backpressure
and frame timestamps feeding mediabunny. Measure CPU, loopback, permission and signing
behavior against the baseline before enabling it. Store capture provenance before exposing
styling controls; baked-cursor recordings must retain today's behavior. Shape IDs and the
image/hotspot table follow the cursor-free frame path, then the shared preview/export layer.
