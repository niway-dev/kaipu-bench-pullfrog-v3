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

The stream defaults to eight seconds and requests `showsCursor = false`, BGRA frames and an optional
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

This compiles the helper and checks 17 invalid-invocation refusals before capture.
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

### Cursor control and packet contract probe (2026-11-03)

The native CLI accepts `--show-cursor` (off by default) and `--duration SECONDS`
(default 8, finite range 0.5–30). Reports record the actual requested configuration,
requested duration, display global bounds, point/pixel scale, and read-only CGEvent
pointer coordinates before and after capture, with host-clock timestamps. Coordinates
use global top-left desktop points and selected-display local points; crop coordinates
remain display-local. Endpoint equality does not establish continuous pointer immobility.
No pointer input, permission reset, app quit or Electron launch is needed.

A local paired take on display 3 used `--rect 1600,780,320,180 --duration 1`,
with `--show-cursor` only on the control. All four endpoint samples were global/local
`(1916,893)`, corresponding to crop `(316,113)`. Decoded frames were inspected:
the control visibly contains a clipped arrow at the display's right edge; the off
frame does not. There were 66 pixels with an RGB channel difference above 40,
bounded by output `[315,111,320,127)`. Other low-level codec differences are not
cursor evidence. This supports exclusion of the visible arrow fragment for that crop,
not complete arrow/hotspot, I-beam, hand, motion or multi-display transition validation.
A separate display-1 crop at `(100,100,320,180)` produced 640×360 at scale 2;
the pointer was outside it, so that retina take is metadata/capture evidence only.
Artifacts and original reports are preserved outside Git under
`/tmp/kaipu-cursor-evidence`; `pixel-comparison.json` records the comparison.

The runnable packet probe uses the installed mediabunny API directly:

```sh
node apps/kaipu-record/scripts/native-packet-remux-probe.mjs INPUT.mov /tmp/NEW-remux-directory
# Bun supports the same command/script.
```

It reads MOV with `Input`/`FilePathSource` and `EncodedPacketSink`, adds packets in
source decode order to `EncodedVideoPacketSource` and optional
`EncodedAudioPacketSource`, supplies each first decoder configuration, awaits each
add for backpressure, and writes MP4 with `FilePathTarget`. It neither decodes nor
changes packet timestamps/durations. It refuses an existing output directory.
Reopening the MP4 asserts track count/types/codecs, packet count/type/bytes/SHA-256,
every presentation timestamp and duration (2 µs container-quantization tolerance),
and per-track/movie end duration. Reports include first/last timestamps and distinct
packet durations; packet hashes are diagnostic metadata, not a production buffer.

Observed with Node on the earlier real `native-final/capture.mov`: 4 AVC packets
with distinct durations 0.375, 0.033333 and 8.24 seconds; 394 AAC packets starting
at 0.183604 seconds; movie end 8.681667 seconds. All assertions passed and FFmpeg
fully decoded the resulting MP4 without errors. The helper's 418 audio callback
samples are not encoded AAC packet counts. Audio remained the previously measured
silent source (-91 dB); audible loopback and AV sync are unproven. Bun also passed
on the new video-only off take (2 packets, 0.998333-second movie, variable packet
durations 0.965 and 0.033333 seconds). This validates packet remuxing from a finished
native artifact; it does not validate live transport, CPU parity or production integration.

Before live helper integration: define encoded payload framing and decoder-config
changes, preserve native PTS/duration/timebase and shared audio/video epoch, deliver
packets in decode order, bound IPC queues with awaited backpressure, propagate
errors/end-of-stream and finalize/cancel safely, and handle helper lifecycle including
SIGINT/SIGTERM. Add signed helper packaging/TCC identity, sustained motion/load and
audible audio/AV-sync measurements. Raw 4K RGBA must not be transported over IPC.
Keep production capture unchanged until those contracts and cursor provenance for
editable overlays are implemented and verified. Owner-machine Electron launches
require asking first per the user's no-local-e2e memory; native probes do not waive it.

## Live encoded transport slice (2026-11-03)

**Status: 🟡 Staged integration, not a selectable recording backend.**

`native/encoded-capture/main.swift` is a separate live ScreenCaptureKit/VideoToolbox
helper, not a finished-file remux. It emits AVC access units directly to stdout.
`showsCursor=false`, no frame reordering, explicit dimensions/fps/bitrate, one retained
native surface, serial encoding and blocking pipe writes bound the pipeline. A timer
encodes the retained surface during idle intervals. One encoded packet is held until
the next PTS establishes its duration; stop flushes that packet through the host stop
time and emits an explicit end duration. This currently encodes repeated idle frames
at the requested cadence; it does not claim VFR efficiency or CPU parity.

Wire v1: eight-byte big-endian prefix (`uint32 JSON length`, `uint32 payload length`),
UTF-8 JSON header, binary payload. Header maximum 16 KiB, payload maximum 8 MiB.
`config` carries version, AVC codec string, dimensions and monotonic host `epochUs`;
its payload is avcC. `packet` carries epoch-relative integer `ptsUs`, `durationUs` and
`keyframe`; payload is length-prefixed AVC. `end` carries the exact last packet end.
Config changes, non-key first packets, nonzero first PTS, overlap, invalid sizes/times,
truncation and missing end fail the take. This version intentionally forbids B frames.
Absolute epoch uses CoreMedia host time, not wall time or renderer performance.now().

`main/recording/native/session.ts` pulls frames from stdout only when requested,
validates them, rejects concurrent pulls, bounds stderr, times out stalled reads,
and kills/cancels on failure. Stop sends `stop` on stdin and requires continued
consumption through end/EOF; cancel destroys the pipe, sends SIGTERM and escalates
to SIGKILL after one second. Helper EOF on stdin cancels cooperatively. Native
SIGINT/SIGTERM still use OS termination: explicit native signal-driven SCK/VT teardown
is an open barrier, not a solved lifecycle claim. There is no switch to Chromium
after capture starts.

Main/preload expose `electronAPI.nativeCapture` only to the main window's main frame.
The methods are always present, but capability/open require macOS, the explicit
`--experimental-native-encoded-transport` app flag and an exact helper `--version`
match. Capability always returns `recordingReady:false`. Destruction, navigation,
renderer failure and application quit cancel the owned session. An in-flight open
is invalidated by cancel. No arbitrary executable path is accepted over IPC.

Build explicitly (no installation, auto-build or signing):

```sh
bash apps/kaipu-record/scripts/build-encoded-capture.sh /tmp/kaipu-encoded-capture-v1
/tmp/kaipu-encoded-capture-v1 --version
```

Packaged discovery is fixed at
`process.resourcesPath/app.asar.unpacked/resources/native/kaipu-encoded-capture`.
Existing `asarUnpack: resources/**` supports this location, but the helper is **not**
automatically copied/built/signed by release scripts. Missing/incompatible helpers
report unavailable; packaging and signed TCC identity must be implemented/validated
before changing the capability gate. Do not launch Electron locally without owner
permission to exercise the bridge.

`recorder-engine.ts` exports `attachNativeEncodedVideo(output, reader)`: attach before
`output.start()`, await `pump()`, then finalize output. It uses the installed
mediabunny `EncodedVideoPacketSource("avc")`/`EncodedPacket` API, supplies decoder
config on the first packet and awaits every add before requesting the next IPC frame.
It closes only after explicit end plus EOF, cancels reader/output on error, and returns
host epoch, dimensions and excluded-cursor provenance. It accepts the preload reader
structurally. The caller owns stop/cancel and the Output target; `prepareEngine` and
`recorder-store` do **not** select this path yet. No new UI is exposed.

New Chromium recordings persist `capture.cursorPixels:"embedded"` through the existing
capture-sidecar path. Sanitization preserves explicit `embedded`/`excluded` values;
legacy/imported/unknown data remains ineligible under `canOverlayRecordedCursor`.
The experimental consumer returns `excluded`, but no native take is saved to the
library yet. No cursor overlay/style UI exists in this slice. Never infer editable
cursor eligibility from a cursor JSON track alone.

### Verification and remaining barriers

Targeted framing/lifecycle/provenance/consumer tests cover fragmented input, truncation,
oversize prefixes, config/keyframe/order/end rejection, concurrent pulls, cancellation
of an in-flight read, process failure/version refusal and awaited mediabunny pressure.
The consumer test intentionally mocks the writer to hold backpressure; a separate
opt-in integration test uses the real helper and real mediabunny muxer:

```sh
KAIPU_NATIVE_TEST_HELPER=/tmp/kaipu-encoded-capture-v1 \
KAIPU_NATIVE_TEST_DISPLAY=3 \
KAIPU_NATIVE_TEST_OUTPUT=/tmp/NEW-live.mp4 \
bun run --cwd apps/kaipu-record test -- src/main/recording/native/live.integration.test.ts
```

Choose a currently available 16:9 display; the test requests a 320×180 whole-display
video at 30 fps/1 Mbps and stops 700 ms after receiving config. On this host display 3
passed: actual live AVC was muxed, reopened, and checked for zero first PTS, first
keyframe, multiple packets and matching final duration. A stronger follow-up checks
every packet payload/type and PTS/duration against the live wire. The installed MP4
muxer defaults to a 57,600 Hz timebase, so this live test allows one container tick
(17.37 µs), not the finished-MOV probe's 2 µs tolerance. An initial 2 µs assertion
failed by 3.53 µs; that was a quantization mismatch, not lost packet bytes. FFmpeg decoded the resulting
MP4 without errors. Artifact: `/tmp/kaipu-cursor-evidence/live-encoded-v1.mp4` (local,
transient, not committed). This proves a small native video pipeline, not Electron IPC,
rendered pixels, audible audio, cursor shape/motion, 4K load or signed release behavior.
The default integration test is skipped unless the explicit helper environment is set.

Before recorder selection: connect the quality preset/source/area geometry planner
without distortion; add system audio and mic mixing/live controls; watermark/webcam
and thumbnail handling; cursor host epoch mapping; a single pause-gap clock shared by
video/audio/cursor with matching idle/end semantics; prepared/countdown/start failure
and writer lifecycle; signed helper resource build, version/TCC checks and native
signal cleanup. Requests currently accept only whole-display video parameters;
unknown option fields are rejected. There is no audio/mic/pause API to silently ignore.
Pre-take unsupported configurations must produce an explicit fallback decision; no
fallback is selected by this transport. Only then can `recordingReady` become true.
The next independent review is pending; this slice is not labelled production-ready.

Final checks for this slice: targeted recording/transport/writer/store tests exit 0,
149 passed and one opt-in native test skipped; the opt-in native test separately
passes (1/1), including packet conservation, and its validated MP4 decodes with
FFmpeg (exit 0). Swift build, app type checks and Electron-Vite build exit 0.
Repository lint exits 0 with 17 warnings outside this slice. The broad app suite
exits 1: four library suites cannot import the installed Electron dependency
(`Electron failed to install correctly`); 4,587 tests passed and one then-stale
provenance expectation failed. That expectation is corrected and its 93-test store
suite passes in the final targeted run. No dependency repair or Electron launch
was attempted. Full-suite green, Electron bridge execution, packaged/native signing
and user-visible editable capture remain unverified. Logs stay outside Git in
`/tmp/kaipu-cursor-evidence/live-slice-*.log`. The new tests encode the project-specific
lessons (explicit end, bounded pull, fail-closed provenance); no shared skill/hub edit
was needed.
