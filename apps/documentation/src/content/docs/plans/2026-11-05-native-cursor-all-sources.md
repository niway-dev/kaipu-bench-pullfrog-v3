---
title: Native cursor capture for every source — implementation plan
description: Bite-sized, independently mergeable PRs that take the experimental native cursor-free capture from whole displays to area and window sources with the webcam, the mic and system audio on. Each unit names the failing test to write first, the files it touches, checkable acceptance criteria and a manual "How to test it yourself" on the Mac mini. The flag stays off throughout.
---

# Native cursor capture for every source — implementation plan

**Status: 🔵 Proposed · 2026-11-05.** Implements the spec
[native cursor capture for every source](/specs/2026-11-05-native-cursor-all-sources-design/)
and [ADR 0047](/architecture/decisions/0047-native-capture-crops-at-the-source-streams-window-geometry-and-drops-the-bubble-fallback/).
One Linear ticket per PR (team NIW2, project Kaipu, label `claude`; the ticket id goes in the
branch name and the PR title). Working document: the shipping PR of the last unit deletes it.

## Rules for every unit

- **Flag off.** Nothing here changes a default. Every renderer test that opens the helper does
  so through the test bridge; every real-app proof runs `bun run dev:native-capture`.
- **Test first.** The named failing test is written and seen red before the change.
- **No Electron or E2E on the owner's machine.** Real-app proof runs on the Mac mini
  (`ssh macmini`, repo `~/Documents/Workspace/Agent/kaipu-record`; build with
  `electron-vite build`, screen capture only as a launchd job — see the Mac mini guide in
  memory). Each unit's "How to test it yourself" is written for that machine, and the PR body
  ends with it.
- **Protocol bumps land with their reader.** A helper argv or frame change bumps the
  `--version` string in `main.swift` and the pin in `native/session.ts` in the same PR.
- **Architecture rules.** `src/shared/**` takes no value import from a workspace package;
  i18n keys in `packages/i18n/messages/{en,es}.json`; no new install scripts.
- Sizes: S ≈ half a day, M ≈ a day, L ≈ two days for a Sonnet implementer.

## Order

```
A1 helper source-rect ─► A2 area wiring ─► S1 sync proof (screen + area)
W1 webcam under native ──────────────────┘
W0 window spike (docs only) ─► N1 helper window + geometry ─► N2 main cursor geometry ─► N3 renderer window ─► S2 sync proof (window) ─► D1 docs + status
```

A1, W1 and W0 are independent and can run in parallel. A2 needs A1. N1 needs W0's record.
N2 needs N1's frame type. N3 needs N2. S1 needs A2 and W1; S2 needs N3.

---

### A1 — Helper: optional source rectangle (protocol 3) · S

Branch `feat/niw2-___-native-source-rect`.

**Failing test first.** `src/main/recording/native/session.test.ts`: "accepts an optional
`sourceRect` inside the display and refuses one outside or with extra keys";
`validateNativeHelper` resolves for `kaipu-encoded-capture/3 source-rect` and rejects the `/2`
string. `live.integration.test.ts` (runs only where the helper builds): a capture with
`--source-rect 0 0 400 300` and output `400×300` yields a `config` of `400×300`; the same
source rect with output `800×600` fails with "cannot upscale"; output `400×200` fails the
aspect check.

**Change.**

- `native/encoded-capture/main.swift`: parse `[--source-rect X Y W H]` after `BITRATE`
  (points, within the display's `contentRect`); set `config.sourceRect`; compare the aspect
  and the no-upscale guard against the rect (times `pointPixelScale`) instead of the display;
  `--version` → `kaipu-encoded-capture/3 source-rect`. The `--test-allow-unmatched-parent`
  flag stays last.
- `src/shared/native-capture.ts`: `NativeVideoRequest.sourceRect?: { x; y; width; height }`.
- `native/session.ts`: `validateNativeRequest` accepts the key set with or without `sourceRect`
  (integers ≥ 0, width/height ≥ 2); `spawnNativeVideo` appends the argv; the version pin
  changes.
- `scripts/build-encoded-capture.sh`: no change (it rebuilds when `main.swift` is newer).

**Acceptance.** Unit tests green; the live test green on the Mac mini; `bun run build:native-capture`
produces a helper whose `--version` prints the new string; a whole-display take under
`dev:native-capture` still records (no regression: the rect is optional).

**How to test it yourself (Mac mini).** `bun run build:native-capture && resources/native/kaipu-encoded-capture --version`
prints `kaipu-encoded-capture/3 source-rect`. Run
`bun run --cwd apps/kaipu-record test -- src/main/recording/native/` and read the three
source-rect rows pass. Record a 5 s whole-display take with `bun run dev:native-capture`; it
opens in the editor with the Cursor entry.

---

### A2 — Area under native: wiring, thumbnail, request shape · M

Branch `feat/niw2-___-native-area`. Needs A1.

**Failing test first.** `recorder-engine.test.tsx`: in "falls back before encoding unsupported
options", the `area` row moves out of the `it.each` and becomes "opens the native helper for
an area with the area's target and passes the area": `bridge.open` called with
`{ sourceId: "screen:3:0", area: {...}, width: 640, height: 360, ... }` and no `displayId`
key; `MediaStreamVideoTrackSource` not constructed. `native/ipc.test.ts`: "resolves an area to
a source rect on its display and refuses an area on another display" (uses the hub's
`sanitizeArea`). A new `captureThumbnail` unit: with a source rect the poster draws that
region (canvas `drawImage` called with the 9-argument form).

**Change.**

- `recorder-engine.ts`: `nativeEligibility` drops the area refusal; `bridge.open` sends
  `{ sourceId, area: options.area ?? null, ...target, frameRate, videoBitrate }` (remove
  `displayId: 1`); `captureThumbnail(screenStream, target, areaPlan?.source)` crops under
  native (the Chromium path keeps drawing the compositor track as today).
- `src/shared/native-capture.ts`: `NativeCaptureBridge.open` request type = encode params +
  `sourceId` + `area?`; `NativeVideoRequest` keeps `displayId` (main fills it).
- `native/ipc.ts`: resolve `displayId` for `screen:`; with an area, sanitize against that
  display and set `sourceRect = area.rect`; refuse other displays. Keep the `window:` refusal
  for now (N3 lifts it).
- `recorder-store.ts`: no change expected (it already passes `area`); confirm
  `capture.cursorPixels` reaches the sidecar for an area take (`buildRecordingCapture` sets
  `embedded`, the store overrides from `handle.cursorPixels` at line ~652).

**Acceptance.** Tests above green; an area take under `dev:native-capture` saves a video of
the area's size, the sidecar says `capture.mode: "area"` and `cursorPixels: "excluded"`, the
editor shows the Cursor entry and the pointer lands where it was inside the area; the poster
shows the area, not the display; a Chromium area take (flag off, no switch) is byte-identical
in behaviour (golden test from ADR 0030 still green).

**How to test it yourself (Mac mini).** `bun run dev:native-capture`, choose Frame, draw a
rectangle around a terminal, record 10 s moving the pointer in and out of it. Open in the
editor: the Cursor entry is present, the drawn cursor follows the real one inside the area and
disappears outside it. Export MP4; scrub a frame at 2× zoom: no OS cursor pixels. Compare the
poster in the library with the area.

---

### W1 — Webcam under native: drop the guard, no bubble replacement, notice · M

Branch `feat/niw2-___-native-webcam`. Independent.

**Failing test first.** `recorder-engine.test.tsx`: the `webcam` row leaves the fallback
`it.each`; new "opens the native helper with a webcam and starts the webcam output on the
same clock": `bridge.open` called, `webcamHandle.startTimesAfterStop()` resolves
`{ screen: epoch, webcam: <webcam t0> }`, handle exposes `transport: "native"`.
`recording-hub.test.ts`: "while a native session is open, a webcam that ends does not replace
the bubble" (`cameraBubble.replace` not called, `bubbleProtection.webcamEnded` called).
`recorder-store` test: "a webcam that ends under native shows `record.webcamStoppedNative`".
`bubble-protection.test.ts`: unchanged (it is transport-agnostic); add one row that documents it.

**Change.**

- `recorder-engine.ts`: `nativeEligibility` drops the webcam refusal; the handle gains
  `transport`; `onWebcamUnavailable` path unchanged (native opens after it).
- `native/ipc.ts`: `registerNativeCaptureTransport` returns `{ isOpen: () => reader !== null }`;
  `recording-hub.ts` receives it and `bubbleRejoinsCapture` returns after
  `bubbleProtection.webcamEnded` when native is open (no `replace`, no `applyProtection`).
  `applySettingsPatch`'s camera-on branch: when native is open, never `destroy()` a parked
  bubble to make it capturable — just `show()`.
- `recorder-store.ts`: `onWebcamEnded`/`webcamReopenFailed` pick the notice by
  `handle.transport`.
- `packages/i18n/messages/en.json`, `es.json`: `record.webcamStoppedNative` (owner wording,
  spec open question 3; placeholder English in the PR, flagged for the owner).
- ADR 0037: a one-line pointer under decision 6 to ADR 0047 for the native transport.

**Acceptance.** Tests green; under `dev:native-capture` with the camera on: a take records
`<id>.webcam.mp4`, the screen video has no bubble, the editor shows the face as a layer and the
Cursor entry; unplug the camera mid-take (or toggle it off and on with the device removed): the
take continues, the toast says the camera stopped, the editor hides the bubble from that
moment (file end / gap), the screen video still has no bubble anywhere.

**How to test it yourself (Mac mini).** Camera on, `bun run dev:native-capture`, record 15 s;
at 7 s turn the camera off via ⌃⌘K, at 10 s on again. Editor: webcam layer visible 0–7 s,
hidden 7–10 s, visible after; cursor drawn throughout. Repeat with the camera unplugged at
7 s: notice appears, bubble hidden from 7 s to the end. Decode the screen MP4 at 5 s and 12 s:
no bubble pixels.

---

### S1 — Sync proof: screen and area with webcam + mic + system audio · S (proof, docs)

Branch `docs/niw2-___-native-sync-proof-screen-area`. Needs A2 and W1.

**What it is.** A measured take per source on the Mac mini, recorded on the backlog page's
evidence table. A small script `apps/kaipu-record/scripts/native-sync-probe.mjs` (ffprobe/ffmpeg
through the repo's pinned tooling) prints: first audio peak time, first bright-flash frame
time in the screen MP4, first clap frame in the webcam MP4 (brightness delta), first click in
the cursor sidecar.

**Failing test first.** A unit for the probe's pure parts: given synthetic brightness and
loudness arrays it reports the right indices.

**Acceptance.** For screen and area, mic + system audio (metronome file playing) + webcam:
|audio − flash| ≤ 33 ms, |webcam clap − flash| ≤ 33 ms, |click sample − flash| ≤ 8 ms (one
cursor sample). Numbers and artifact paths go in the backlog page; artifacts stay local under
`.evidence/native-sync/`.

**How to test it yourself (Mac mini).** Play `metronome.wav`, start a take, clap in front of
the camera while pressing the key that flashes the screen (the probe doc names the page to use),
stop after 5 s, run the probe on the three files and read the deltas.

---

### W0 — Window spike (throwaway code, docs-only PR) · M

Branch `docs/niw2-___-native-window-spike`. Independent; the throwaway helper build lives on
a local branch that is not merged.

**What it is.** The seven rows of the spec's §3.1, run on the Mac mini with a helper variant
that accepts `--window ID` and logs `SCWindow.frame` plus the frame attachments to stderr.
No product code is merged; the PR adds the results table to
`/backlog/cursor-free-capture-diagnostic/` (a "Window capture spike" section) and settles the
spec's open questions 1 and 2 with the observed errors.

**Acceptance.** Every row has an observation and a pass/fail; the coordinate formula (row 7)
has one measured example on a two-display layout; the PR lists which rows block N1.

**How to test it yourself.** Read the table; re-run row 1 with `node -e` against
`desktopCapturer` and `CGWindowListCopyWindowInfo` (`swift -e`) for one window and compare the
numbers.

---

### N1 — Helper: window filter and `geometry` frames (protocol 4) · L

Branch `feat/niw2-___-native-window-helper`. Needs W0.

**Failing test first.** `native/session.test.ts`: request validation accepts
`{ windowId, width, height, frameRate, videoBitrate }` (no `displayId`, no `sourceRect`) and
refuses a mix; version pin `kaipu-encoded-capture/4 window-geometry`.
`src/shared/native-capture-sequence.test.ts` (new file): `NativeSequence` accepts a `geometry` frame
before `config` and between packets, refuses one after `end`, refuses a malformed rect.
`live.integration.test.ts`: capturing the test's own helper window (a `--test-window` self
target) yields a `geometry` frame before `config` and a `config` of the requested size.

**Change.**

- `main.swift`: `--window CGWINDOWID W H FPS BITRATE`; `SCContentFilter(desktopIndependentWindow:)`;
  `ignoreShadowsSingleWindow = true`, `scalesToFit = true`; emit `geometry` on start and on
  change (frame from `SCWindow`, refreshed as W0 found; content from `contentRect` and
  `contentScale` attachments); window closed → the behaviour the owner chose (spec OQ 1).
- `src/shared/native-capture.ts`: `geometry` header type; `NativeSequence` rules.
- `native/session.ts`: argv for a window; version pin.

**Acceptance.** Tests green; the live test green on the Mac mini; a whole-display and an area
take still work (A1/A2 unchanged).

**How to test it yourself (Mac mini).** Run the helper by hand against a Terminal window id
(from W0's row 1 recipe) for 5 s while moving and resizing the window; the stderr log shows
`geometry` frames with changing `frame` and `content`; the `config` size never changes.

---

### N2 — Main: cursor track for a window from streamed geometry · M

Branch `feat/niw2-___-native-window-cursor-track`. Needs N1.

**Failing test first.** `captured-display.test.ts`: `windowCapturedSpace("window:42:0", output)`
returns `{ id: "window:42", bounds: <frame>, content: <placement> }` once a geometry is
known, null before. `cursor-tracker.test.ts`: with a geometry provider, a pointer at the
window's top-left maps to `content.x / output.width`; a pointer 10 points outside maps below
0; after a geometry change the next sample uses the new frame, earlier samples do not move.
`build-cursor-track.test.ts`: `display.id` is `"window:42"`, no `region`. `recording-hub.test.ts`:
`cursorTrackStart` for a `window:` source enables tracking only when a native session is open
and a geometry has arrived; a `geometry` frame from the transport updates the tracker.

**Change.**

- `captured-display.ts`: `windowCapturedSpace`; `CapturedDisplay.content?` (pixels in the
  output) and `output?` size.
- `cursor-tracker.ts`: constructor takes `display | (() => CapturedDisplay)`; `normalized`
  uses the spec's formula when `content` is present.
- `native/ipc.ts`: an `onGeometry(sessionless)` hook the hub subscribes to (one native session
  at a time; the hub maps it to the active take).
- `recording-hub.ts`: `cursorTrackStart` for `window:` sources under native; the Chromium
  window path keeps returning `{ enabled: false }`.

**Acceptance.** Tests green; `bun run cursor-track:check` on a window take (after N3) reports
samples in `[0, 1]` while the pointer was over the window and outside it otherwise.

**How to test it yourself (Mac mini).** Unit tests only in this PR (the renderer cannot open
a window take until N3). Run `bun run --cwd apps/kaipu-record test -- src/main/recording/`.

---

### N3 — Renderer: window source under native · M

Branch `feat/niw2-___-native-window-renderer`. Needs N2.

**Failing test first.** `recorder-engine.test.tsx`: the `window:` row leaves the fallback
`it.each`; "opens the native helper for a window and takes the output size from the config
frame" (`handle.outputSize` equals the config's size; the config check does not throw when
`target` differs from what main chose). `native/ipc.test.ts`: "resolves `window:<id>:0` to a
CGWindowID and an even output size fitted to the cap from the window's frame"; refuses an
unknown window.

**Change.**

- `native/ipc.ts`: lift the `window:` refusal; resolve the id (W0 row 1) and the output size
  (frame × scale, `fitToCap`, even) from `SCShareableContent` via a `--probe-window` helper
  call or from the first `geometry` frame (whichever W0 showed is reliable).
- `recorder-engine.ts`: `nativeEligibility` accepts `window:`; for a window, `target` is
  taken from the `config` frame; `captureThumbnail` draws the Chromium window stream as today.
- `recorder-store.ts`: no change expected; `recordingCaptureMode` already labels `window`.

**Acceptance.** A window take under `dev:native-capture` with camera, mic and system audio on:
saves, opens with the Cursor entry, the pointer is drawn over the window content and hidden
outside it; move and resize the window mid-take: the video letterboxes, the cursor stays on
the content; close the window: the owner's chosen behaviour (OQ 1).

**How to test it yourself (Mac mini).** `bun run dev:native-capture`, pick a Terminal window,
record 20 s: move it at 5 s, resize at 10 s, type at 15 s. Editor: cursor on the text where it
was; webcam layer present; no OS cursor at 2× zoom in the export.

---

### S2 — Sync proof: window · S (proof, docs)

Branch `docs/niw2-___-native-sync-proof-window`. Needs N3 and S1's probe. Same criteria as S1
for a window take; adds one row for cursor-vs-content after a resize (the drawn cursor lands on
the clicked text within 1% of the frame width).

---

### D1 — Status and documentation · S

Branch `docs/niw2-___-native-all-sources-status`. Last.

- Backlog page [cursor-free capture](/backlog/cursor-sprite-capture/): status line lists the
  three sources as done under the flag; the remaining gates (signed helper/TCC, pointer
  shapes, flag rollout) stay listed.
- ADR 0047 status → Accepted with the S1/S2 numbers linked; ADR 0037 pointer (from W1) kept.
- The IPC contract doc (native channels, request shape, `geometry` frame).
- Delete this plan (git keeps it); the PR links the spec.

## Open items for the owner (copied from the spec)

1. Window closed mid-take: end and save (recommended) or fail.
2. Window minimized / off-Space: hold the last frame (recommended) or auto-pause.
3. Wording of `record.webcamStoppedNative` (en/es).
4. Area poster = the area (recommended, matches Chromium) or the display.
