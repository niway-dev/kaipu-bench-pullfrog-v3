---
title: Capture preview card — Capture and Copy end in an image-first floating card
description: "NIW2-606: after a screenshot, Kaipu stays out of the way. Capture and Copy both end in a small floating card at the top-right of the display, where the image is the card: its saved and copied states are visible at rest and become buttons on hover, next to Edit and Close. The editor opens only when asked. Reverses the 2026-10-20 decision that Capture opens the editor."
---

# Capture preview card — design

**Status: 🔵 Proposed · 2026-11-02.** Design only; nothing is implemented. Ticket
[NIW2-606](https://linear.app/niway/issue/NIW2-606). ADR:
[0042](/architecture/decisions/0042-capture-ends-in-the-preview-card/), which supersedes
decision 4 of [0024](/architecture/decisions/0024-window-mode-and-quiet-capture/). Mockup:
[/mockups/capture-preview.html](/mockups/capture-preview.html) (illustrative, hand-written with
the app's tokens).

## Summary (one minute)

Today Copy ends in a small text toast and Capture opens the editor, bringing Kaipu over whatever
the user was doing. After this change both end in the **capture preview card**: the same
floating window the toast uses (`CaptureToastWindow`), redrawn so the screenshot itself is the
card. At rest the image shows two small state pills, **Saved** and **Copied · ⌘V** (Ctrl+V on Windows), so the user
knows where the shot went without touching anything. On hover the card takes an accent border,
the image dims, **Edit** (pencil) appears in the middle and **Close** (✕) in the corner, and the
pills become buttons: Saved reveals the file, Copy copies. A click on the image is Edit too. The
card belongs to the same family as "Your video is ready" after a recording: same corner, same
surface, same border.

| #   | Decision                                                                                                                                                                                                                                                                                           | Why                                                                                                                                                                | ADR                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1   | Capture and Copy both end in the card. The editor opens only from Edit or a click on the image.                                                                                                                                                                                                    | The owner asked for it (2026-11-02): the card is less disruptive than the window, and Edit keeps the editor one click away.                                        | 0042 (new), supersedes 0024 decision 4 |
| 2   | The card is the existing `CaptureToastWindow`, redrawn. No second floating window.                                                                                                                                                                                                                 | Its lifecycle (not focusable, re-targets on a new capture, joins Spaces only while shown, dismissed before the next capture) is already right and tested.          | reuses 0024, 0029                      |
| 3   | Image-first: the shot fills a 280 DIP card. Height follows the aspect ratio between 100 and 220 DIP; beyond that the image is letterboxed, never cropped.                                                                                                                                          | "The image a bit bigger, and the controls on it." A crop could hide what the user captured.                                                                        | —                                      |
| 4   | States are visible at rest (pills on the image) and become buttons on hover.                                                                                                                                                                                                                       | What makes the card Kaipu's rather than CleanShot X's, whose overlay shows nothing until hovered: the user sees "saved, on the clipboard" without reaching for it. | —                                      |
| 5   | **Saved** is a state. Its click reveals the file in Finder / Explorer. When the vault write failed it reads **Save** and retries the write.                                                                                                                                                        | Every capture is already saved (`915a2140`), so a Save that saves would do nothing. Revealing the file is the useful thing left: drag it, attach it.               | —                                      |
| 6   | **Copy** reads **Copied · ⌘V** at rest (Ctrl+V on Windows, the `toast.pasteWith` key the toast already picks per platform) and **Copied ✓** on hover, when the shot is on the clipboard (Copy, or Capture with automatic copy); otherwise **Copy**, which copies and flips. Copied ✓ copies again. | Copy from the card is new; with manual copy there is otherwise no way to copy without opening the editor.                                                          | —                                      |
| 7   | Top-right of the display the shot came from, 18 DIP from the work area's edges.                                                                                                                                                                                                                    | Same corner as the recording-ready card, so Kaipu has one place for "something just finished".                                                                     | —                                      |
| 8   | 10 s auto-hide, held while the pointer is over the card. A new capture replaces the card.                                                                                                                                                                                                          | Capture no longer opens the editor, so the card is now the only way to Edit right away; 6 s was sized for a toast you read, not one you act on.                    | —                                      |
| 9   | The thumbnail is generated at 2× the card's image size: at most 560 px on its longest side, instead of 160.                                                                                                                                                                                        | 160 px stretched over 268 DIP on a Retina display is blurry.                                                                                                       | —                                      |
| 10  | A shot that landed nowhere (vault write and copy both failed) still opens the editor, as today.                                                                                                                                                                                                    | The editor holds the bytes in memory and can retry; a card would lose them when it hides.                                                                          | —                                      |
| 11  | "Open in Library" leaves the card.                                                                                                                                                                                                                                                                 | Four controls are enough on a 280 DIP image; the Library is one click away in the app, and Edit already lands on the item.                                         | —                                      |

## Open questions

None blocking. Two the owner may want to revisit after using it:

- Whether 10 s is right (decision 8). It is one constant.
- Whether Saved should open the Library page instead of the file (decision 5).

## Out of scope

- **The main window coming back above the frontmost app after a capture.** `beforeCapture` hides it
  and a quiet capture shows it again with `showInactive()`, which may put it above the app the
  user was in. Not verified on the owner's machine. The owner will test the card first; this gets
  its own ticket if it shows up.
- Dragging the card into another app, keyboard shortcuts on the card, swipe to dismiss, stacking
  several cards (CleanShot X and macOS have some of these).
- Recording: its card stays as it is.
- Any change to the editor, the overlay or the vault.

## Failures this must protect against

1. **Capture still brings Kaipu forward.** The renderer's capture path or a leftover
   `revealAfterCapture()` reveals the main window on `after: "quiet"`.
2. **The card steals focus.** If it becomes the key window, ⌘V right after Copy pastes nowhere.
   It stays `focusable: false` and `showInactive()`.
3. **The card lands in the next screenshot.** `beforeCapture` must still dismiss it first.
4. **Copy on a saved shot copies the wrong image or nothing.** The file may have been renamed
   (ADR 0035) or the workspace switched since; Copy reads by vault id at press time and reports a
   failure instead of copying stale bytes.
5. **Copy on a copy-only card after its bytes were freed** (a new capture started): the press does
   nothing visible instead of throwing.
6. **A late Save retry repaints a newer card.** The existing generation guard must cover Copy too.
7. **Edit while a Save retry is writing** opens two items, or none (the existing
   `annotateAfterSave` path).
8. **Hover controls flicker.** Moving from the image onto a pill or ✕ must not read as leaving the
   card (one hover region for the whole card, as today).
9. **A tall or very wide shot** overflows the window or is cropped.
10. **A blurry thumbnail on HiDPI**, or one large enough to slow the IPC hop.
11. **A capture that landed nowhere shows a card** whose Save and Edit have nothing behind them.

## Acceptance criteria

- [ ] With Kaipu's window open behind another app, pressing **Capture** shows the card at the top-right of that display and the other app keeps the focus (typing goes there).
- [ ] With Kaipu's window hidden, **Capture** and **Copy** show the card and never show the main window.
- [ ] At rest the card shows the screenshot, **Saved ✓** and, when copied, **Copied · ⌘V** (**Copied · Ctrl+V** on Windows), plus a mono line with size, mode and workspace.
- [ ] On hover the card gets an accent border, the image dims, **Edit** and **✕** appear, and the auto-hide stops; leaving the card restarts a full 10 s.
- [ ] **Edit** and a click on the image open that screenshot in the image editor and bring Kaipu forward.
- [ ] **Saved** reveals the file in Finder (macOS) or Explorer (Windows).
- [ ] With copy set to manual, **Capture** shows **Copy**; pressing it puts the image on the clipboard and the pill reads **Copied ✓**.
- [ ] **✕** hides the card; the screenshot stays in the Library.
- [ ] A second capture while the card is up replaces it with the new shot.
- [ ] A tall (e.g. 390 × 1200) and a wide (e.g. 2400 × 400) capture show whole, letterboxed, inside the card.
- [ ] The thumbnail looks sharp on a Retina display.
- [ ] `capture-toast-window.test.ts`, `capture-toast.test.tsx`, `after-capture-policy.test.ts` and `capture-handler.test.ts` cover decisions 1, 5, 6, 8 and 10.

## Detail

### What happens after a capture

| Action on the overlay  | Library      | Clipboard              | What appears                              |
| ---------------------- | ------------ | ---------------------- | ----------------------------------------- |
| Capture (Enter)        | Always saved | When copy is automatic | The card; the app stays where it was      |
| Copy (⌘C / Ctrl+C)     | Always saved | Always                 | The card; the app stays where it was      |
| Either, save failed    | —            | As above               | The card with **Save** (retry), if copied |
| Either, nothing landed | —            | —                      | The editor, on the bytes in memory        |

`decideAfterCapture` returns `open: "quiet"` for both actions; `copy` stays `action === "copy" ||
copy === "auto"`. `finish` in `capture-handler.ts` already routes `quiet` to `onQuietCapture`,
and keeps the bytes (`keepLastQuietCapture`) when the save failed, so decision 10's fallback is
the existing `!saved && !copied` branch.

### The window

`CaptureToastWindow` keeps its contract and gains three things:

- **Size from the payload.** `toastBounds` takes the card's height: the image height from
  decision 3, plus the meta line and the timer bar, plus 16 DIP of transparent padding around the
  card so its shadow is not clipped (the recording-ready window does the same,
  `READY_WINDOW_PADDING`). Width is 280 + 32 DIP.
- **Two new actions.** `CAPTURE_TOAST_ACTIONS` becomes `edit`, `reveal`, `copy`, `save`, `dismiss`
  (`annotate` renamed `edit`; `open-library` replaced by `reveal`).
  - `reveal`: `shell.showItemInFolder` on the vault item's path, the same call the Library uses
    (`main/library/index.ts`).
  - `copy`: a saved shot is read from the vault by id at press time; a copy-only shot uses the kept
    bytes (`peekLastQuietCapture`, not take, so Edit still works). Both write with the handler's
    `copyToClipboard`, then send the payload again with `copied: true`.
  - `TOAST_AUTO_HIDE_MS` becomes 10 000.
- **A timer channel, main → card.** `screenshot:toast-timer` carries `{ remainingMs: number | null }`
  and is sent from every place main starts, restarts or stops the timer (`restartTimer`,
  `stopTimer`), not from a list of events: today that is renderer ready, re-target, pointer in,
  pointer out, and Edit pressed while that shot's Save is still writing (the card then stays until
  the write ends). A timestamp in the payload would not do: the timer starts when the renderer
  reports ready, not when `show` runs, and a pause resets it to a full 10 s.
  `desktop/ipc-contract.mdx` gains the row.

### The card (renderer)

`capture-toast.tsx` is rewritten around the image. It still only renders main's payload and
reports presses and hover. Pills, ✕ and Edit are buttons inside the one hover region. The
timer bar only mirrors main's timer, which stays the one that hides the card: on each
`screenshot:toast-timer` message (see "The window") the bar animates from `remainingMs` to zero,
or freezes on `null`. The card does not follow the app theme, as today: it floats over
arbitrary screen content. Visual values come from the StatusCard family (`--bg-modal`,
`--border-light`, 14 px corner, `--accent-primary-ring` on hover).

Copy lives in `@kaipu/i18n` under `screenshots.toast` (English and Spanish), replacing the
title, footer and Open in Library keys the text toast used.

### What the state of the art does

- CleanShot X's Quick Access Overlay: a thumbnail in a screen corner; hover shows Copy and Save,
  the pencil opens annotation, shortcuts work only while hovered
  ([iMore](https://www.imore.com/cleanshot-x-gains-new-keyboard-shortcuts-quick-access-overlay-more),
  [podfeet](https://www.podfeet.com/blog/2022/04/cleanshot-x/),
  [features](https://cleanshot.com/features)).
- macOS since Mojave: a thumbnail at the bottom right for about 5 s; click to mark up, swipe to
  dismiss, drag into another app
  ([9to5mac](https://9to5mac.com/2018/10/05/how-to-macos-mojave-screenshots/),
  [Macworld](https://www.macworld.com/article/233597/how-to-get-rid-of-screenshot-foater-macos-catalina.html)).

Kaipu keeps the shape (a thumbnail with hover actions) and differs on one point: the states are
on the image before the hover, because in Kaipu saving and copying already happened.

## References

- [ADR 0024](/architecture/decisions/0024-window-mode-and-quiet-capture/) — quiet capture and the
  toast window.
- [Capture flow fixes](/backlog/capture-flow-fixes/) — the 2026-10-20 decision this reverses.
- [ADR 0029](/architecture/decisions/0029-floating-windows-never-change-the-activation-policy/) —
  floating windows and the activation policy.
- `apps/kaipu-record/src/main/screenshots/capture-toast-window.ts`,
  `after-capture-policy.ts`, `capture-handler.ts`;
  `apps/kaipu-record/src/renderer/src/features/screenshots/toast/`.
