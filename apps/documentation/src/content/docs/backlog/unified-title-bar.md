---
title: "Unified title bar"
description: "The main window draws its own title bar: Kaipu logo, name and workspace switcher in the chrome, with the OS window controls on their native side. NIW2-621."
---

# Unified title bar

> **Status: 🟡 In progress — PR open, owner QA pending** ([NIW2-621](https://linear.app/niway/issue/NIW2-621)).
> Not checked on Windows hardware yet: the Windows layout follows Electron's documented
> `titleBarOverlay` behaviour and still needs a look on a real machine (see
> [Windows beta](./windows-beta)).

## What changes

The main window used to keep the default native frame. The workspace switcher sat on its
own row under it, and the rail repeated the Kaipu logo at its top. Now both move into the
window chrome, one 40 px bar:

| Platform        | Left to right                                                               |
| --------------- | --------------------------------------------------------------------------- |
| macOS           | traffic lights · logo · "Kaipu Record" · workspace chip                     |
| Windows / Linux | logo · "Kaipu Record" · workspace chip · native minimize / maximize / close |

The workspace chip is the existing switcher (workspace and device in one dropdown). The rail
starts with its items.

## How it works

- `src/main/window-chrome.ts` picks the window options per platform: `hiddenInset` with the
  traffic lights centred in the bar on macOS, `hidden` plus `titleBarOverlay` elsewhere. The
  overlay is painted by the OS, so its colors are copies of `--bg-sidebar` and
  `--text-secondary`; a test reads `tokens.css` to keep them in step, and main recolors the
  overlay when the theme changes.
- `src/renderer/src/shell/title-bar.tsx` draws the bar on every route (AppRoot, and the
  router's error screen, which replaces AppRoot). It leaves the controls' side empty: a fixed
  84 px on macOS, `env(titlebar-area-*)` under the Windows overlay.

## Invariants

- The bar is `-webkit-app-region: drag`. Anything clickable in it sits in a `no-drag`
  wrapper, or the OS drags the window instead of delivering the click.
- Nothing goes in the top-right corner on macOS that Windows could not show: the caption
  buttons own that corner there.
- A full-window takeover (onboarding) starts below the bar, so the traffic lights never sit
  on its content and the window stays draggable. The switcher hides while it is open.
- The bar's height is `TITLE_BAR_HEIGHT` in main and `40px` in CSS; change both.
