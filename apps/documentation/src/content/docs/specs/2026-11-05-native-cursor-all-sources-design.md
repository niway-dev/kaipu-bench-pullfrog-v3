---
title: Native cursor capture for every source — design
description: Extend the experimental cursor-free native capture (flag `native-cursor-capture`) from whole displays to area and window sources, with the webcam, the microphone and system audio on. The helper crops an area at the source, records a window through a window filter and streams its geometry so the cursor stays normalized to the frame; the webcam keeps its own file and loses the face-in-screen fallback under native; audio stays in Chromium. The flag stays off.
---

# Native cursor capture for every source — design

**Status: 🔵 Proposed · 2026-11-05.** Design only; no product code in this change. Builds on
the [cursor-free capture backlog page](/backlog/cursor-sprite-capture/) (editable cursor,
2026-11-03) and the [native capture evidence](/backlog/cursor-free-capture-diagnostic/).
ADRs: [0047](/architecture/decisions/0047-native-capture-crops-at-the-source-streams-window-geometry-and-drops-the-bubble-fallback/)
(new, this design), [0030](/architecture/decisions/0030-recording-target-and-area-crop-in-the-compositor/)
(area crop in the compositor: unchanged for Chromium, bypassed under native),
[0037](/architecture/decisions/0037-webcam-is-its-own-track-and-the-bubble-is-excluded-from-capture/)
(webcam file and bubble exclusion: amended for the native transport),
[0038](/architecture/decisions/0038-webcam-is-a-viewport-layer-composed-after-the-zoom-crop/)
and [0041](/architecture/decisions/0041-camera-shape-is-circle-square-or-portrait-with-a-corner-radius/)
(editor layer: unchanged). Plan:
[native cursor for every source](/plans/2026-11-05-native-cursor-all-sources/).

Vocabulary: **native** is the ScreenCaptureKit/VideoToolbox helper
(`apps/kaipu-record/native/encoded-capture/main.swift`) behind the flag; **Chromium** is the
default `getUserMedia` desktop capture. A **take** is one recording session. The **frame** is
the encoded video picture; the **window frame** is a window's rectangle on screen.

## Summary (one minute)

Native capture records a cursor-free video and the editor draws an editable cursor from the
sidecar track. Today it only runs for a whole display with no webcam, no area and no
watermark (`nativeEligibility`, `recorder-engine.ts:1355`). The owner wants the same for an
**area** and a **window**, each with the **webcam on** and **mic + system audio on**, before
the flag can ever go on. Done means: the three sources record under native with webcam, mic
and system audio; the editor shows the editable cursor; the export has no baked-in cursor;
audio, webcam and cursor stay in sync. The flag stays **off**; there is no rollout here.

The design keeps the transport shape (one helper process, one encoded H.264 stream muxed by
mediabunny, audio and thumbnail still acquired by Chromium) and adds three things:

1. **Area**: the helper crops at the source with `SCStreamConfiguration.sourceRect` and
   encodes the area's own target size; the aspect check becomes "preserve the crop's
   aspect". The cursor track is already normalized to the area (ADR 0030), so the editor
   needs nothing.
2. **Window**: after a spike proves the id mapping and the resize behaviour, the helper
   records a window through `SCContentFilter(desktopIndependentWindow:)` at a fixed output
   size and **streams the window's geometry** (frame on screen, content rectangle inside
   the output) as a new `geometry` frame kind. Main normalizes each cursor sample against the
   latest geometry, so the sidecar stays version 1 and the editor needs nothing.
3. **Webcam**: the native guard goes. The helper already excludes the whole Electron process,
   so the bubble is never in the screen video; the price is that the "face goes back into
   the screen" fallback cannot exist under native. Owner decision: keep what was recorded,
   hide the bubble after the failure through the existing gap and file-end mechanism, and
   tell the user the camera stopped. A webcam that fails to open at the start keeps the take
   native, without a webcam file.

Audio does not change: Chromium still acquires the screen source with loopback audio and the
mic is mixed in; the one shared anchor is the native epoch. The work adds a sync proof on the
Mac mini per source, not a new clock. The watermark still forces Chromium and is out of scope.

| #   | Decision                                                                                                                                                                                                                                                                                            | Why                                                                                                                                                                                                                                                                                                                      | ADR                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| 1   | **An area is cropped in the helper** with `sourceRect` (display points) and encoded at `areaEncodePlan(...).target`; the helper's aspect check compares against the crop, not the display. The Chromium path keeps its compositor crop.                                                             | The native path has no compositor; re-adding a canvas would reintroduce the cost ADR 0030 measured and put the cursor-free frames through a redraw. `sourceRect` is one property on the configuration the helper already builds. ADR 0030 rejected a native crop _as the default_; here the transport is already native. | 0047 (new); 0030 unchanged for Chromium                |
| 2   | **The main process resolves the native request**: the renderer sends `sourceId` plus the area or nothing; main maps `screen:` to a display id and an area to `sourceRect`, and later `window:` to a CGWindowID. The renderer's `displayId: 1` placeholder goes.                                     | Main already overrides the display id for `screen:` sources (`ipc.ts:97`), so the placeholder is harmless today but wrong in shape once a window request exists. One resolver, no trust in renderer numbers.                                                                                                             | —                                                      |
| 3   | **A window is recorded at a fixed output size through a window filter, and the helper streams the window's geometry.** Output size: the window frame at start in pixels, fitted to the cap and rounded even. A resize scales into the fixed frame (`scalesToFit`); the pixel placement is reported. | The muxer and the sidecar want one picture size per take. SCK delivers per-frame `contentRect`/`contentScale` attachments for exactly this; letterboxing on resize is what every window recorder does. A take that restarts the stream on resize would cut the video.                                                    | 0047                                                   |
| 4   | **Window cursor samples are normalized per sample against the latest geometry**; the sidecar stays `version: 1` with `display.id = "window:<id>"`. The editor and export change nothing.                                                                                                            | The editor reads only `t/x/y/clicks` from the track (nothing reads `display.width/height` outside tests); normalizing at the writer is the ADR 0030 rule that kept every consumer unchanged for areas. A time-varying rectangle in the sidecar would touch every consumer for one source kind.                           | 0047                                                   |
| 5   | **Window support ships behind a spike** with written pass/fail rows (plan unit W0): Electron `window:<id>:0` → CGWindowID → `SCWindow`; move; resize; minimize; close; off-Space. Product code for windows waits for the spike's record.                                                            | The owner asked for it. Three of the six behaviours (minimized, off-Space, closed) decide whether the take ends gracefully or fails, and that decides the helper's protocol.                                                                                                                                             | —                                                      |
| 6   | **Under native the webcam has no face-in-screen fallback.** The `webcam` guard in `nativeEligibility` goes; main does not replace the bubble with an unprotected one while a native session is open; the notice says the camera stopped, not that the face went into the screen.                    | The helper excludes the whole Electron process by pid: no window of ours can reach the file, so the fallback would silently lie. Owner decision 2026-11-05: keep the recorded part, hide the bubble after the failure through `WebcamGapLog`/`webcamHasFrameAt`, let the user hide the rest with hidden segments.        | 0047 (amends 0037 decision 6 for the native transport) |
| 7   | **A webcam that fails to open at the start keeps the take native**, with no webcam file.                                                                                                                                                                                                            | The bubble is not in the screen either way under native, so switching to Chromium would only trade a sharp cursor for nothing. `onWebcamUnavailable` still runs (it drops the protection, harmless) and the toast still says the camera is unavailable.                                                                  | 0047                                                   |
| 8   | **Audio stays in Chromium on the native epoch**; each source gets a sync proof (clap-and-flash) on the Mac mini, with a tolerance of one frame at 30 fps for audio and the webcam and one cursor sample for the pointer.                                                                            | Loopback audio only comes with Chromium's desktop capture; this is the working path for whole displays. The unverified parts are precision, not mechanism; measured numbers settle them.                                                                                                                                 | —                                                      |
| 9   | **Helper protocol bumps once per transport change** (`--version` string, `validateNativeHelper`) and the request shape stays an exact key set (`validateNativeRequest`).                                                                                                                            | The reader refuses an unknown helper, and the helper refuses an unknown argument set; a stale binary after a pull fails before a take, not during one.                                                                                                                                                                   | —                                                      |
| 10  | **Watermark stays Chromium-only.** Not trivial: a watermark means a canvas pass over every frame, which is the compositor the native path exists to skip.                                                                                                                                           | Out of scope by owner direction; recorded so no PR "just adds it".                                                                                                                                                                                                                                                       | —                                                      |
| 11  | **A window closed mid-take ends the take and saves it.** The helper turns the stream's stop into a `stop` at the last delivered frame.                                                                                                                                                              | Owner decision 2026-11-05 (recommended option). The user keeps everything recorded up to the close; failing the take as today (`didStopWithError`, exit 1) would discard it.                                                                                                                                             | 0047                                                   |
| 12  | **A window minimized or moved to another Space holds the last frame.** The take continues; the video repeats the last frame and the cursor keeps sampling against the last known geometry. No automatic pause.                                                                                      | Owner decision 2026-11-05 (recommended option). An automatic pause changes the clock model.                                                                                                                                                                                                                              | 0047                                                   |
| 13  | **Native webcam-stopped notice wording** (`record.webcamStoppedNative`): en "Camera stopped — the rest of the video has no camera"; es "La cámara se detuvo: el resto del video no tiene cámara".                                                                                                   | Owner-approved wording 2026-11-05; replaces the earlier proposal.                                                                                                                                                                                                                                                        | 0047                                                   |
| 14  | **The poster/thumbnail of an area under native shows the area**, cropped with `areaEncodePlan(...).source` (unit A2).                                                                                                                                                                               | Owner decision 2026-11-05; matches what the Chromium path produces today.                                                                                                                                                                                                                                                | —                                                      |

### Open questions

None — all resolved by the owner on 2026-11-05.

### Out of scope

- Turning the flag on, rollout, or a signed/notarized helper (TCC validation stays open on the
  backlog page).
- Watermark under native (decision 10).
- Removing the duplicate Chromium acquisition (audio + thumbnail); a native audio path.
- Windows and Linux; the Chromium path on any platform is unchanged.
- Recorded pointer shapes (hand, I-beam) and the mediabunny private-field clock bridge
  (`_firstMediaStreamTimestamp`, `recorder-engine.ts:1123`): noted as a risk, not changed.
- Changing the area or the window while recording beyond what SCK does on its own.

## 1. Where the code is today

Verified on `main` at `c3d63a06`, 2026-11-05.

- **Helper** `native/encoded-capture/main.swift`: argv `--encoded-capture-v1 DISPLAY W H FPS
BITRATE` (line 179); `SCContentFilter(display:excludingApplications:exceptingWindows:)`
  excluding the parent pid's application (187–189); `showsCursor = false`,
  `capturesAudio = false` (194–196); the output must keep the display's aspect and not
  upscale (192); `--version` answers `kaipu-encoded-capture/2 prepared pause-clock` (178).
  Frames: `ready`, `config` (carries `epochUs`, `cursorPixels: "excluded"`), `packet`, `end`.
- **Reader** `src/main/recording/native/session.ts`: `validateNativeRequest` demands the exact
  key set `displayId,frameRate,height,videoBitrate,width` (line 31) and `validateNativeHelper`
  pins the version string (25). **IPC** `native/ipc.ts`: `open` refuses non-`screen:` sources
  (92) and resolves `displayId` from `desktopCapturer` for `screen:` sources (93–99); the
  renderer's `displayId: 1` (`recorder-engine.ts:435`) is therefore always overwritten today —
  the investigation called it a bug; it is a placeholder that becomes wrong only when the
  request shape grows (decision 2).
- **Engine** `src/renderer/src/features/recording/recorder-engine.ts`: `nativeEligibility`
  (1355) refuses `window:`, area, watermark and webcam; Chromium acquires screen + loopback
  audio first (345–355) and the mic is mixed into one AAC track (656, 744); the native video
  is attached as encoded packets (730) and the config's size must equal `target` (734);
  `begin` sets mediabunny's private `_firstMediaStreamTimestamp` to the epoch (1123–1127);
  pause/resume/stop pass `at + nativeOffset` (1040, 1046, 1073); the webcam is a second
  `Output` on the same renderer clock (754–) with `startTimesAfterStop` (1183).
- **Cursor track** `src/main/recording/captured-display.ts`: `pickCapturedDisplay` returns
  null for `window:` sources (24) — no cursor track for a window today, native or not;
  `areaCapturedDisplay` (40) normalizes to the area. `cursor-tracker.ts` normalizes against a
  fixed `bounds` (137–140). `recording-hub.ts:804–817` starts the tracker. The sidecar
  (`src/shared/cursor-track.ts`) is version 1 with an optional `region` (49–54).
- **Webcam fallback** `recording-hub.ts:639–654` (`bubbleRejoinsCapture`): once a take runs,
  a protected bubble is **replaced** by an unprotected window so a running Chromium capture
  records the face. `bubble-protection.ts` tracks whether the take still records a webcam.
  The renderer reports the end through `recordingWebcamEnded` (`recorder-store.ts:539–549`).
  The engine's gap log (`webcam-gaps.ts`) and the editor's `webcamHasFrameAt`
  (`video-editor/webcam/webcam-sync.ts:24`) hide the bubble where the file has no frame.
- **Flag**: `native-cursor-capture`, default `false` (`src/shared/analytics.ts:25`); the main
  process also honours `--experimental-native-recording` (`bun run dev:native-capture`).
- **Pinning tests**: `recorder-engine.test.tsx` ("falls back before encoding unsupported
  options", ~1975) pins the four refusals; `native/session.test.ts` pins the request keys;
  `native/live.integration.test.ts` runs the real helper on a Mac.

## 2. Area under native

### 2.1 Request

The renderer sends what it sends today plus the area it already holds:

```ts
bridge.open({ sourceId, area: options.area ?? null, ...target, frameRate, videoBitrate });
```

`target` is `areaEncodePlan(trackSize, area, capHeight).target` — the same size the Chromium
compositor would encode, so the sidecar's `capture.width/height` and the editor's assumptions
do not change. Main (`ipc.ts`) resolves the request: `screen:` → `displayId`;
`area` → `sourceRect = { x, y, width, height }` in display points (= the area's
display-relative DIP rectangle, which is what `RecordingArea.rect` already is). Main
sanitizes the area against the display (`sanitizeArea`, as the hub does for the cursor track)
and refuses one that names another display.

`validateNativeRequest` accepts the exact key set with an optional `sourceRect` and checks it
is inside the display, even-sized is not required for the source (only the output).

### 2.2 Helper

New argv (protocol 3): `--encoded-capture-v1 DISPLAY W H FPS BITRATE [--source-rect X Y W H]`.
With a source rect:

- `config.sourceRect = CGRect(x, y, w, h)` (display points; SCK takes points, not pixels).
- The aspect guard compares `W/H` against `sourceRect.width/height` and refuses upscaling
  past `sourceRect × pointPixelScale`.
- Everything else (exclusion by pid, `showsCursor = false`, pause clock, lookbehind) is
  untouched.

`--version` answers `kaipu-encoded-capture/3 source-rect`; `validateNativeHelper` pins it.

### 2.3 Engine and cursor

- `nativeEligibility` drops the `area` refusal.
- The config dimension check (`recorder-engine.ts:734`) already compares with `target`; with
  an area, `target` is the area plan's target, so it holds.
- The poster thumbnail (`captureThumbnail`, 1210) draws the whole Chromium stream into
  `target`; under native with an area it must draw `areaPlan.source` (decision 14).
- The cursor track is already normalized to the area for every `screen:` source with an area
  (`recording-hub.ts:811–815`); no change.

## 3. Window under native

### 3.1 The spike (W0) — pass/fail rows

Run on the Mac mini with `bun run dev:native-capture` and a throwaway helper build. Record the
outcome on the backlog page; product code for windows starts only after it.

| Row | Check                                                                                                                                                | Pass                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Electron `desktopCapturer` window source id `window:<n>:0` — is `<n>` the CGWindowID? Compare with `CGWindowListCopyWindowInfo` for the same window. | Same number for three apps (Terminal, Safari, Finder).                                 |
| 2   | `SCShareableContent.windows.first { $0.windowID == n }` → `SCContentFilter(desktopIndependentWindow:)`, `showsCursor = false`, 5 s capture.          | Frames arrive; no cursor pixels; the Electron bubble over the window is not captured.  |
| 3   | Move the window during the capture.                                                                                                                  | Frames keep coming; `SCWindow.frame` (re-read) follows; no stream restart.             |
| 4   | Resize the window with a fixed `config.width/height` and `scalesToFit = true`.                                                                       | Frames keep the output size; `SCStreamFrameInfo.contentRect`/`contentScale` report it. |
| 5   | Close the window.                                                                                                                                    | Record which delegate error fires and whether the last frames were delivered.          |
| 6   | Minimize; move to another Space; bring back.                                                                                                         | Record whether frames stop, resume, and what `contentRect` says meanwhile.             |
| 7   | Coordinate origin: `SCWindow.frame` vs Electron `screen.getCursorScreenPoint()` on a two-display layout.                                             | A formula that maps one to the other, written down with one measured example.          |

Rows 1, 2 and 4 are must-pass; rows 3, 5, 6 and 7 decide the protocol details below.

### 3.2 Helper

New argv: `--encoded-capture-v1 --window CGWINDOWID W H FPS BITRATE`. The helper:

- builds `SCContentFilter(desktopIndependentWindow: window)`; sets
  `ignoreShadowsSingleWindow = true`, `scalesToFit = true`, `showsCursor = false`;
- keeps the fixed output `W×H` (main computes it from the window frame at open time: pixels =
  frame × scale, `fitToCap`, rounded even);
- emits a new frame kind on every change and at least once before `config`:

```ts
{ kind: "geometry"; atUs: number;
  frame: { x: number; y: number; width: number; height: number };   // screen points, top-left origin
  content: { x: number; y: number; width: number; height: number }; } // pixels inside the output
```

`frame` is read from `SCWindow` (refreshed through `SCShareableContent` on a timer or from
the frame attachments, whichever the spike shows is cheap and current); `content` comes from
the `contentRect`/`contentScale` attachments of the last delivered frame.

- on the stream ending because the window closed: the helper emits `stop` at the last
  delivered frame and the take ends and is saved (decision 11).
- on the window being minimized or moved to another Space: the take continues and the helper
  keeps re-encoding the retained surface, so the video holds the last frame (decision 12).

### 3.3 Cursor track for a window

- `pickCapturedDisplay` gains a sibling `windowCapturedSpace(windowId, outputSize)` returning
  a `CapturedDisplay` with `id: "window:<id>"`, `bounds` = the last geometry's `frame`, and a
  new optional `content` placement; `CursorTracker` takes a `geometry()` provider instead of
  fixed bounds and normalizes each sample as

  `x = (content.x + (p.x − frame.x) / frame.width × content.width) / output.width` (same for
  y). A pointer outside the window lands outside `[0, 1]` and the editor hides it, as it does
  for another display today.

- The hub receives `geometry` frames from the native IPC (main sees them first, before the
  renderer pulls them) and updates the tracker; the frame still flows to the renderer, where
  `attachNativeEncodedVideo` ignores it.
- The sidecar keeps `version: 1`; `display` = `{ id: "window:<id>", width/height: output in
DIP, scaleFactor }`. No `region`.

### 3.4 Engine

`nativeEligibility` accepts `window:`; the request carries `sourceId` and main resolves the
CGWindowID and the output size; the config check compares with that size (the renderer learns
it from the `config` frame, so `target` for a window is "whatever main chose", which the
existing `outputSize` handle already reports). The Chromium window stream keeps feeding the
poster and the loopback audio.

## 4. Webcam under native

- `nativeEligibility` drops the `webcam` refusal. The engine's webcam path (second `Output`,
  relay, gaps, `endWebcam`) runs exactly as under Chromium.
- `registerNativeCaptureTransport` exposes `isOpen(): boolean`; the hub's
  `bubbleRejoinsCapture` leaves the bubble as it is while a native session is open (no
  `replace`, no new unprotected window) and only updates `BubbleProtection`. On `isCameraEnabled`
  toggles mid-take the parking logic is unchanged (the window stays out of the capture whether
  parked or shown — the pid exclusion does not depend on protection).
- Notice: when the renderer reports `onWebcamEnded` and the take is native, the store shows
  `record.webcamStoppedNative` (decision 13) instead of `record.webcamUnavailable`. The
  renderer knows the take is native (`native !== null` in the engine; expose
  `transport: "native" | "chromium"` on the handle beside `cursorPixels`).
- Webcam failing to open before the take: the engine awaits `onWebcamUnavailable`, which
  drops protection (harmless), then opens the native helper as for a take without a webcam.
- Sync: screen t0 is the native epoch (`quality: "exact"`); the webcam t0 is mediabunny's first
  media timestamp of the webcam `Output` on the same renderer clock; `startOffsetMs` is their
  difference as today. The proof (unit S1) measures the real offset error with a clap-and-flash
  take under native with mic + system audio + webcam.

## 5. Audio under native

No mechanism change. The one thing to prove per source is ordering and precision:

- With a webcam the screen is acquired **after** the webcam settles (`recorder-engine.ts:357`,
  383); the native helper opens after the Chromium screen stream (405–459). Nothing in that
  order changes; the `begin` epoch is taken after every device is open, so device-open latency
  does not enter the offset.
- Proof S1 (Mac mini): one take per source with mic on, system audio on (play a metronome
  file), webcam on; a clap in front of the camera next to a key press that flashes the screen.
  Decode and measure: audio peak vs flash frame vs webcam clap frame vs cursor click sample.
  Pass: audio and webcam within 33 ms of the flash, the click sample within 8 ms.

## 6. Risks and how each is bounded

- **`_firstMediaStreamTimestamp` is private** (mediabunny). Already guarded by a throw when
  the field is missing; a mediabunny bump must re-run S1. Out of scope to replace.
- **Duplicate acquisition** (Chromium + native) doubles screen capture cost. Measured on the
  diagnostic page; unchanged here.
- **Window geometry lag**: a sample taken between a move and its `geometry` frame normalizes
  against the old frame; bounded by the helper's refresh interval (spike row 3 measures it;
  target ≤ 1 cursor sample at 125 Hz is not realistic, ≤ 1 video frame is).
- **Helper/reader drift**: the version pin fails closed; the plan bumps it in the same PR as
  every protocol change.

## 7. Sources

- Apple, `SCStreamConfiguration.sourceRect`, `scalesToFit`, `ignoreShadowsSingleWindow`,
  `SCContentFilter(desktopIndependentWindow:)`, `SCStreamFrameInfo.contentRect`.
- Electron `desktopCapturer` source ids and `display_id`.
- Repo: ADR 0030, 0037, 0038; backlog pages linked above; the files and lines cited in §1.
