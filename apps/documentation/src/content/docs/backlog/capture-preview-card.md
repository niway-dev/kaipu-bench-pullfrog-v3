---
title: "Capture preview card — every capture ends in a floating card, not the editor"
description: "NIW2-606: Capture and Copy both end in an image-first floating card at the top-right of the display. Saved and Copied are visible at rest; on hover the card shows Edit, Close, and the states as buttons (reveal the file, copy, retry a failed save). The editor opens only from Edit."
---

# Capture preview card

> **Status: 🟢 Ready to validate** — [NIW2-606](https://linear.app/niway/issue/NIW2-606),
> [PR #486](https://github.com/niway-dev/kaipu-record/pull/486). Unit tests pass and the real
> component was screenshotted in a browser harness; it has not run inside Electron yet. Owner QA
> pending. Design: [spec](/specs/2026-11-02-capture-preview-card-design/),
> [ADR 0042](/architecture/decisions/0042-capture-ends-in-the-preview-card/), mockup
> [/mockups/capture-preview.html](/mockups/capture-preview.html). Parent: [screenshots](./screenshots).

## What the user sees

| Action on the overlay  | Library      | Clipboard              | What appears                              |
| ---------------------- | ------------ | ---------------------- | ----------------------------------------- |
| Capture (Enter)        | Always saved | When copy is automatic | The card; the app stays where it was      |
| Copy (⌘C / Ctrl+C)     | Always saved | Always                 | The card; the app stays where it was      |
| Either, save failed    | —            | As above               | The card with **Save** (retry), if copied |
| Either, nothing landed | —            | —                      | The editor, on the bytes in memory        |

- At rest: the screenshot, **Saved ✓**, **Copied · ⌘V** (Ctrl+V on Windows) when copied, and a
  mono line with size, mode and workspace. A bar drains over 10 s.
- On hover: accent border, the image dims, **Edit** in the middle and **✕** in the corner, the bar
  stops. **Saved** reveals the file; **Copy** copies and flips to **Copied**; a click anywhere on
  the image is Edit.

## Where it lives

- `apps/kaipu-record/src/shared/capture-preview-layout.ts` — the card's geometry, shared by main
  (window size) and the renderer (image height).
- `apps/kaipu-record/src/main/screenshots/capture-toast-window.ts` — the window, its actions and the
  `screenshot:toast-timer` channel; `after-capture-policy.ts` sends Capture there too.
- `apps/kaipu-record/src/renderer/src/features/screenshots/toast/capture-toast.tsx` — the card.

## Known limits

- After a capture the main window, if it was open, comes back inactive and may sit above the app
  you were in. Out of scope here; the owner tests the card first.
- No keyboard access to the card: its window never takes focus, so ⌘V keeps pasting in your app.
