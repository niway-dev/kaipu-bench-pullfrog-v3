---
title: Capture destination and quiet Copy
description: Capture can show a preview or open the editor; Copy confirms briefly without showing Kaipu.
---

# Capture destination and quiet Copy

> Status: 🟢 Ready to validate — follows PR #486. Native desktop QA pending.

The owner-approved follow-up separates the intent to copy from the intent to capture.
[ADR 0043](/architecture/decisions/0043-capture-destination-and-quiet-copy/) records the decision.

## Acceptance criteria

- [ ] Capture defaults to the preview card, with no main window appearing.
- [ ] Settings → Screenshots can persist “Show preview” or “Open editor”.
- [ ] Capture with “Open editor” opens the saved image without a preview card.
- [ ] Explicit Copy ignores the destination preference and only shows a brief “Copied” confirmation.
- [ ] Copy still saves to the Library, and Capture still respects automatic clipboard copying.
- [ ] Quiet completion never restores the main window; cancellation restores prior visibility.
- [ ] Failed save or clipboard writes retain the existing recovery paths.

## Validation

Policy, capture handler, window hooks, toast timer, settings sanitization and renderer tests
exercise these branches. They cannot establish native application activation, Space changes,
window stacking or pasting into a different app: validate those on macOS and Windows.

The root cause identified in code was `createCaptureWindowHooks.afterCapture("quiet")`
calling `showInactive()` whenever the main window had previously been visible. That call
is removed; only explicit editor reveal and cancellation restore the main window.
