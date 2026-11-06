---
title: "Cursor-free capture and a drawn cursor (v2.1)"
description: "Future improvement for the video editor's auto-zoom: exclude the OS cursor from the screen capture and draw our own at export, so it stays sharp at any zoom level and can be smoothed. Deferred from v2; reopen if zoomed cursors look bad in production."
---

# Cursor-free capture and a drawn cursor

> **Status: 🟢 Ready to validate — native capture on by default** (2026-11-05, [NIW2-660](https://linear.app/niway/issue/NIW2-660)).
> Screen, Frame and Window recordings on macOS record without the OS cursor, with the
> webcam, microphone and system audio, and the editor draws an editable cursor. The flag
> `native-cursor-capture` now defaults to on and stays as a PostHog kill switch
> ([analytics and flags](/desktop/analytics-and-flags/#native-cursor-kill-switch)). Chromium
> capture remains the fallback (watermark takes, a missing or refused helper). Pending: the
> first signed release confirming the helper launches under the hardened runtime, and the
> mid-take edge cases NIW2-650 (sleep) and NIW2-651 (mic). Recorded pointer shapes remain open.
> Native capture evidence: [native capture execution](/backlog/cursor-free-capture-diagnostic/).
> The sections after the implementation record below retain the original v2 design rationale.

## Editable cursor implementation record (2026-11-03)

The editor's right inspector has a **Cursor** entry. On recordings with explicit
`capture.cursorPixels: "excluded"` and a nonempty validated cursor track it exposes:

- Show cursor; Arrow, Dot or Spotlight presentation style.
- Size (16–96 reference pixels at 1080 output height), independent of camera zoom.
- Smoothing (0–100), a source-time exponential filter, precomputed once per settings/track.
- None, Circle or Ripple click effects; click bounce. Both require `clicksAvailable`.
- Hide after 1.5 seconds idle; recorded clicks reset the idle timer.

Settings live in the scene/session, pass through undo/redo and debounced autosave, and
survive reopening. Legacy sessions receive visible-arrow defaults. Missing, malformed,
embedded or unknown-provenance cursor tracks never receive an overlay. Recorded hand,
I-beam and resize shapes are **not captured**; the inspector states that limitation and
has no misleading “match recorded pointer” control. Native new scenes default to a visible
32-pixel arrow; the first position is clamped back to source zero when the hook starts
milliseconds after the video. The real native lifecycle take was reopened and painted at zero.

`cursor/cursor-model.ts` owns source-time sampling, smoothing, idle state, click phases,
camera-crop coordinate projection and Canvas2D painting. Preview uses the existing video
frame clock and writes to its canvas without per-frame React state. MP4 and GIF workers
receive the same track/settings and use the same model/painter after crop, before the webcam.
Fixed-canvas Fit/Fill projects the hotspot onto the final canvas and sizes the pointer from
that canvas's height. Slides have no cursor; cuts and trims keep source timestamps; held
recompositions use the same source camera timestamp as their crop.

Privacy wins over cursor presentation: the whole cursor/effect layer is hidden during an
active privacy span. Export also suppresses it when the decoded frame's source interval
intersects a privacy span, including held private frames. This conservative boundary may
hide the export pointer one decoded frame earlier than the preview. The painter reads no
source pixels and cannot replace redacted pixels. “Hold to see original” hides the layer.

Default embedded-cursor export fingerprints remain stable. Eligible editor exports carry
a cursor compositor revision (`cursor3` since the painter and defaults changed) so an
export drawn by an earlier painter cannot be offered as an equivalent export, even with
default cursor settings.

### Observed evidence

Artifacts are local and ignored under `.evidence/editable-cursor/`; no captures are committed.
`apps/kaipu-record/scripts/editable-cursor-proof.cjs` creates its own profile/vault, launches
cached Electron 39.8.10, exercises the actual editor and MP4 exporter, and closes only its
owned process. The proof uses a generated slate
and deterministic position/click fixture for reproducible pixel measurements; it optionally
copies the prior actual native recording/sidecar to prove default cursor visibility there.
It does not manufacture evidence of new native capture or OS cursor exclusion.

| Criterion                                         | Observation                                                                                                                                                             | Evidence                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Inspector changes reach persistence and reopen    | Size 64, smoothing 65, ripple and bounce survived actual autosave and reload; all three styles rendered                                                                 | `editor-arrow.png`, `editor-dot.png`, `editor-spotlight.png`, `result.json` |
| Actual MP4 contains cursor after trim and 2× zoom | Source 1.1 s → edited timeline 0.6 s; 1920×1080 preview white-arrow bounds `[1346,544,1379,587]`, decoded export `[1346,544,1378,587]`; 689 vs 677 white pixels         | `preview-cursor.png`, `export-frame.png`, `export.mp4`, `result.json`       |
| Privacy and embedded provenance                   | Cursor canvas fully transparent during private source span; embedded fixture resolves without a cursor canvas                                                           | `editor-privacy.png`, `editor-embedded.png`, `result.json`                  |
| Actual native take opens visibly by default       | Prior native lifecycle output opened in the editor with Show cursor checked, Size 32 and nonempty cursor canvas                                                         | `editor-native-default.png`, `result.json`                                  |
| Model/compositor boundaries                       | Deterministic seeking, off-display/truncated/empty track, click unavailability, idle boundary, migration, undo/redo, held/private frame and Fit/Fill projection covered | targeted suite below                                                        |

From `apps/kaipu-record`:

```sh
MAIN_VITE_SERVER_URL=http://127.0.0.1:1 MAIN_VITE_WEB_URL=http://127.0.0.1:1 bun run build
KAIPU_CURSOR_NATIVE_RESULT=/tmp/kaipu-native-recorder-proof/result.json node scripts/editable-cursor-proof.cjs
bun run test -- src/renderer/src/features/video-editor src/renderer/src/features/editor/open-in-editor.test.ts src/shared/native-capture.test.ts
```

- Build and node/web types: exit 0.
- Isolated runtime proof: exit 0; decoded arrow measurement
  enforces ≤2 pixels per bound and ≤5% white-mask area difference for lossy H.264.
- Targeted editor/provenance suite: exit 0, **956 passed / 81 files**.
- i18n suite: exit 0, **22 passed**.
- Full app suite: exit 1, **4614 passed / one skipped**, same four pre-existing library import
  failures: “Electron failed to install correctly”. No dependency repair.
- Root lint: exit 0, zero errors; existing warnings retained.

### Review route and remaining gates

1. `cursor/cursor-model.ts`: judge the source-time filter, idle semantics, on-display and
   truncation boundaries, and deliberate whole-layer suppression during privacy spans.
2. `export/compose-output-frame.ts`: judge post-crop/final-canvas placement and the more
   conservative decoded-frame privacy boundary; command parity tests and real decoded
   H.264 proof cover different parts of this contract.
3. `pages/video-editor/video-editor-page.tsx` and `components/inspector/cursor-inspector.tsx`:
   judge provenance gating, selection handoff, history gestures, persistence and worker inputs.
4. `export/export-reuse.ts`: judge legacy compatibility versus cursor compositor revision.

Remaining: actual pointer-shape capture/replay; moving native pointer pixel-exclusion
and clock-error proof, long/4K60 capture stress, signed packaged helper/TCC/notarization.
The GIF worker is wired and type-checked through the shared composer, but GIF remains
product-disabled and was not runtime-exported here. Fit/Fill and held-frame behavior have
unit proof; the decoded runtime frame proof covers the native-aspect MP4 case. The
independent review history lives in [PR #493](https://github.com/niway-dev/kaipu-record/pull/493).

The durable project lesson is encoded in tests: exclusion provenance must gate every
replacement cursor, source-time sampling must be seek-independent, and a default-pointer
export needs its own compositor fingerprint. No shared skill or hub changes were needed.

## The gap

Video editor v2 records the cursor track (position at 125 Hz, clicks when
Accessibility is granted) as a sidecar next to the recording — the same approach the
auto-zoom tools use. Where v2 differs from the best of them is one layer earlier, in
the **capture**:

|                                  | Screen Studio, Cap                    | Kaipu v2                                              |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| OS cursor in the captured pixels | **No** — excluded at capture time     | **Yes** — baked into every frame                      |
| Cursor drawn at export           | Their own sprite, after the zoom crop | None; the recorded cursor is magnified with the frame |
| Cursor at 2× zoom                | Sharp, fixed on-screen size           | Blurry, twice its natural size                        |
| Pointer smoothing, click ripples | Possible                              | Not possible                                          |

Their capture path (ScreenCaptureKit on macOS, the Graphics Capture API on Windows)
has a flag to leave the cursor out. Ours does not: the app records through Electron's
`getUserMedia` + `chromeMediaSource: "desktop"`, which exposes no such option. That is
the whole reason this is deferred, not a lack of design.

## Why "just draw a cursor on top" was rejected for v2

Plan 12 evaluated drawing a sprite over the recorded cursor and cut it:

- The recorded cursor is in the pixels and is magnified by the zoom; a sprite must be
  at least as large as the magnified original to hide it.
- The track stores positions, not cursor **shapes**. Over text the OS shows an I-beam,
  over links a hand, over a resize edge an arrow pair. An arrow sprite on top of an
  I-beam is not "faint", it is two different cursors — most of the time, on
  text-heavy recordings. Electron has no API for another app's current cursor shape.
- The sprite must sit on the recorded cursor's hotspot within a couple of pixels on
  every frame; the clock model accepts up to one frame of error per pause, which at
  fast pointer speeds is tens of pixels — a visible ghost trail.

So a drawn cursor is only worth it when the recorded one is **gone** from the pixels.

## What v2.1 would do

1. **Capture without the cursor** when auto-zoom is on. Either a Chromium/Electron
   path that honours cursor exclusion, or a native capture module that replaces
   `getUserMedia` for the screen track. The latter is a much bigger change (system
   audio, source picker and permissions all ride on the current path).
2. **Store a coarse cursor type per sample** if the OS exposes it (arrow / I-beam /
   hand / resize); otherwise draw an arrow only and document the limitation.
3. **Draw the sprite after the camera crop**, at a fixed on-screen size, using the
   existing cursor track (`sampleCursor(track, t)` already interpolates it). The track
   format does not change.
4. **Tighten the clock error** across pauses to under one frame (plan 01 accepts
   about one frame today), because with a drawn cursor a one-frame offset is visible.
5. Then the extras become cheap: pointer smoothing, click ripples, a hidden cursor
   during "fixed" zooms.

Everything below the capture layer — the track, the detector, the camera path, the
export composition order — is already built to accept this; the sprite is one more
draw call after `cropRectPx`.

## Spike A (the research that gates this)

Time-box one day on a throwaway branch and record the result here:

- [ ] macOS and Windows: capture via `getDisplayMedia({ video: { cursor: "never" } })`
      served by `session.setDisplayMediaRequestHandler` (same screen source); record
      5 s moving the pointer. **Is the cursor in the pixels?**
- [ ] Same with the current `getUserMedia` + `chromeMediaSource: "desktop"` path and any
      constraint Chromium documents for cursor capture on this Electron version.
- [ ] If either excludes the cursor on **both** OSes: list what else changes (system-audio
      path, source picker, permissions) — that is the real cost of v2.1.
- [ ] If neither does: estimate a native capture module (ScreenCaptureKit / Windows
      Graphics Capture) and decide whether the feature justifies it.

## When to pick this up

Reopen this item if, after v2 ships, any of these shows up:

- Users comment on the **blurry or oversized cursor** inside zooms, or compare it to
  Screen Studio.
- The soft-zoom hint (plan 12) is not enough and people want zooms above 2× on 1080p
  recordings — a sharp cursor is a large part of what makes those look acceptable.
- Spike A is run for another reason and comes back positive on both platforms.

Until then, v2's behaviour — the recorded OS cursor, zoomed with the frame — is the
accepted trade-off.

## Non-goals

Detecting the cursor from the video pixels (shape changes, camouflage, no click
signal — rejected in the [pipeline spec](/specs/2026-09-21-zoom-cursor-follow-design/)).
Custom cursor themes. Cursor effects on recordings without a cursor track.

## Review fixes (2026-11-03)

Native pending reads now suspend their stall timeout while paused, rearm on resume and stop, and still cancel on process failure. A real helper test paused for 6.2 seconds and muxed successfully; a separate delayed-stop test preserved the take. Commands beyond lookbehind clamp to the last emitted edge with stderr diagnostics, so extreme main-process stalls can introduce timing drift rather than discard the recording.

The recorder requires a successful cursor-tracking handshake before selecting native capture; failed/disabled/timed-out tracking falls back to Chromium before begin. Prepare copies load and replay the default cursor and use a distinct `whole:cursor3` fingerprint. Missing replay data stops that copy instead of silently producing cursorless video. Fit exports scale the pointer with the fitted footage height, preserving its visual proportion from preview. Editor fingerprints also carry the cursor revision (`cursor3`) to invalidate prior framing results.

Verification: 287 focused tests across seven files, types and build passed; two real-native integration tests passed, including long pause and late stop. Prepare handoff and missing-data refusal have UI-hook tests; decoded Prepare-copy runtime parity remains unverified. Signed production validation and native motion synchronization remain open.

Final review follow-up: a quick resume queued behind a clamped late pause now clamps to the same effective pause edge; the take is preserved instead of failing with Invalid resume clock. The native regression test fails against the previous binary and passes after the fix. Prepare arrow rendering, Fit/Fill pointer sizing, reuse and missing-track refusal were also proven in an isolated app.
