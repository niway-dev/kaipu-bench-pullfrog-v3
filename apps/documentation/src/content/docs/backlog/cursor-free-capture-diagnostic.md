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

1. Use a fresh `--user-data-dir` for an isolated diagnostic process; do not quit an active installed instance. This separates the instance lock/settings, not macOS permission identity.
2. Build through the normal macOS packaging path, including native dependency rebuilding
   and signing: `bun run --cwd apps/kaipu-record build:mac`. Use the generated `.app` path
   from that command. Do not substitute a development run for packaged evidence.
3. Launch the executable directly, passing the flag:

   ```sh
   env -u ELECTRON_RUN_AS_NODE "/path/to/Kaipu Record.app/Contents/MacOS/Kaipu Record" --cursor-capture-diagnostic --user-data-dir=/tmp/kaipu-cursor-probe-user-data
   ```

4. Select a display. Leave **Request system audio** unchecked for cursor comparisons. Choose **Current legacy baseline**,
   then **Record 8 seconds**. Move the pointer over text and buttons on the selected source.
   The baseline requests loopback alongside video and, like the current recorder, falls back
   to video-only on rejection; the report retains the audio failure.
5. Save both WebM and JSON using the links. Repeat with **cursor always** and **cursor never**
   on the same source, with audio unchecked. Inspect the video to confirm the intended source; the JSON includes the actual video track label/settings. Run separate audio experiments with the checkbox enabled and recognizable audio playing. Repeat for window capture.
6. Play each saved file with sound enabled. The diagnostic's live monitor is muted to avoid
   feedback. Inspect cursor pixels while moving and stationary, including arrow, I-beam and
   hand transitions. Note audible system audio separately from audio-track presence.
7. Repeat after denying screen permission, then after granting it and restarting. Record
   which prompt appeared, its wording and whether restart was necessary. The JSON records
   permission status before and after source enumeration, not the final permission state.

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
remain manual evidence gaps. A standalone ScreenCaptureKit prototype is described below; production helper
build/signing integration is still absent. Existing `.cursor.json` data, default baked cursor recordings and editor
controls are unchanged.

## Next implementation slice

Complete the packaged comparison first. If cursor pixels remain with `never`, add an
explicitly enabled ScreenCaptureKit helper (`showsCursor = false`) with lifecycle/backpressure
and frame timestamps feeding mediabunny. Measure CPU, loopback, permission and signing
behavior against the baseline before enabling it. Store capture provenance before exposing
styling controls; baked-cursor recordings must retain today's behavior. Shape IDs and the
image/hotspot table follow the cursor-free frame path, then the shared preview/export layer.

Audio experiments may fail independently of cursor support. In particular, macOS loopback permissions and the packaged Info.plist audio usage description need separate validation; an audio-enabled failure is not evidence that cursor exclusion failed. The diagnostic does not register the kaipu protocol or handle second-instance deep links.

## Native ScreenCaptureKit prototype (explicit opt-in)

`native/cursor-capture/main.swift` is a separate macOS 14+ diagnostic executable. It is
not bundled or invoked by the recorder. Build it to a location outside Git:

```sh
bash apps/kaipu-record/scripts/build-cursor-sck-diagnostic.sh /tmp/kaipu-cursor-sck
/tmp/kaipu-cursor-sck --cursor-sck-diagnostic DISPLAY_ID /tmp/new-capture-directory --rect 0,0,640,360
```

The executable refuses to run without that flag. Output must be a new directory.
An unavailable display ID reports the available IDs. `--rect` uses selected-display
points; output uses the filter's pixel scale and even H.264 dimensions. Omit it for
the whole display. Audio is off unless `--audio` is supplied. The helper preflights
Screen Recording access and fails without requesting permission when unavailable.
Its permission identity is the helper/launching host, not necessarily the signed app.
Do not reset permissions or quit an installed instance to run this probe.

The eight-second stream requests `showsCursor = false`, BGRA frames and an optional
48 kHz stereo system-audio stream excluding the helper's own audio. It writes an
H.264/AAC MOV through AVAssetWriter as an inspectable intermediate, plus JSON with
sample counts, readiness drops, source rectangle, output dimensions and host-clock
epoch. Both tracks retain ScreenCaptureKit presentation timestamps. Audio preceding
the first complete video frame is dropped explicitly. A serial sample queue, SCK
queue depth of three and writer-readiness checks bound the frame pipeline. One last
frame is retained to span static-screen intervals through the stop timestamp; frame
reordering is disabled. Failure to write that duration frame fails the probe.

This establishes a native capture/encode experiment, not the mediabunny transport.
No raw-frame IPC, cursor provenance migration, editable controls, cursor shapes,
preview/export overlay, window capture, production helper signing, pause/resume or
production lifecycle integration is implemented. Backpressure counters are observable,
but sustained overload and CPU parity still need measurements. Existing recordings
and capture defaults are unchanged.

```sh
bash apps/kaipu-record/scripts/check-cursor-sck-diagnostic.sh
```

This compiles the helper and checks eight invalid-invocation refusals before capture.
It does not prove OS permissions, pixels, system audio audibility or encoder timing.

### Local packaged probe observations (2026-11-02)

At foundation commit `5e9d7ec3`, `build:unpack` completed using Electron 39.8.10 and
the patched native rebuild. The machine had zero valid signing identities, so the
builder skipped signing. This is packaged evidence, not release-signing parity.
The shell inherited `ELECTRON_RUN_AS_NODE=1`; direct launch rejected Electron flags
until launched using `env -u ELECTRON_RUN_AS_NODE`. With a separate `--user-data-dir`,
the package reached source enumeration and reported screen permission `granted`.
That directory isolates settings/lock, not TCC permission identity.

Native UI automation could not select the package: the exact path timed out twice,
and selecting the bundle ID returned ambiguity with `/Applications/Kaipu Record.app`.
The installed app was left running. No Electron `legacy`/`always`/`never` take,
download or cursor-pixel comparison was obtained; these remain open rather than
being inferred from permission or settings. The standalone SCK probe can run
independently of that UI driver. Local evidence is outside Git under
`/tmp/kaipu-cursor-evidence`; those files are transient and not release artifacts.

The standalone helper compiled with Apple Swift 6.4 targeting macOS 14. A 640×360
crop produced H.264 video; a separate audio-enabled take produced 418 audio samples
and a 48 kHz stereo AAC track. `ffprobe` measured 8.681667 seconds, within 1 ms of
the 8.6808905-second reported host-clock interval. Both readiness-drop counters
were zero for that small static workload. FFmpeg volume analysis measured silence
(mean/max -91 dB); this does **not** validate audible loopback. A decoded frame was
inspected for capture content, but no controlled pointer movement was recorded,
so cursor exclusion remains unverified. This small crop does not establish full-screen
performance, overload behavior or audio/video synchronization under motion.

An earlier static-screen take encoded only 0.133 seconds before final-frame padding
was implemented. An intermediate audio take overshot its host-clock interval before
frame reordering was disabled and the writer session end was set. Those takes are
superseded timing probes, not passing evidence. This timing failure is why the
prototype retains one frame and reports its host-clock interval independently of
sample count. The final movie's audible-audio and cursor verdicts remain unverified.

Native follow-up: malformed rects with extra nonnumeric or empty tokens are rejected (10 CLI refusal checks). Start/stop/finalize errors cancel the writer on its serial queue and prefer the original stream error. SIGINT/SIGTERM recovery remains unimplemented; this diagnostic is not a production recorder. The retained last frame consumes an additional SCK surface; motion-load behavior remains unverified.
