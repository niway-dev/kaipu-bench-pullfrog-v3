---
title: Kaipu Black — deeper dark palette and flat panels
description: One deeper black palette and a flat, line-separated panel style shared by the desktop app and the website, delivered in six parts.
---

# Kaipu Black — deeper dark palette and flat panels

> **Status: 🟡 In progress** (2026-11-03). Tracker: NIW2-613 (parent) with one child per part.
> Part 1 (tokens) is in the first PR; the rest follow in order.

## Why

The desktop app and the website use gray surfaces and a card style: panels with a border, a
radius and margins between them. The owner prefers an all-dark, flush look with the Kaipu pink
accent. Both products read `@kaipu/tokens`, so the palette changes once, at the source.

## Palette

| Token                                  | Dark value                                 | Use                                                                    |
| -------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `bg-canvas`                            | `#060607`                                  | behind the video and main content areas                                |
| `bg-panel`                             | `#0b0b0d`                                  | sidebar, header, inspector, transport, timeline                        |
| `bg-raised`                            | `#0e0e10`                                  | timeline tracks, inputs, list rows                                     |
| `bg-hover`                             | `#17171a`                                  | hover                                                                  |
| `bg-active`                            | `#202024`                                  | pressed or selected                                                    |
| `line`                                 | `rgba(255,255,255,.08)`                    | the only separator                                                     |
| `line-strong`                          | `rgba(255,255,255,.14)`                    | input and secondary-button borders                                     |
| `text`, `text-2`, `text-3`, `text-4`   | `#f3f3f5`, `#c8c8d0`, `#8a8a92`, `#62626a` | text scale; `text-4` is for mono labels only and is below AA by design |
| `accent`, `accent-soft`, `accent-ring` | `#f6055c`, `.14`, `.5`                     | brand                                                                  |
| `shadow-popover`                       | `0 24px 60px -18px rgba(0,0,0,.75)`        | popovers and toasts only                                               |

The legacy names (`bg-app`, `bg-card`, `border`, `text-muted`, …) alias these values, so each
surface migrates in its own PR without a breaking rename. Light values for the new names mirror
the existing light surfaces; the light look is not redesigned.

## Parts

1. Tokens in `@kaipu/tokens` (this PR).
2. Desktop: flat panels, radii and shadows.
3. Desktop: glow, active sidebar item, buttons, badges and labels.
4. Web: adopt the palette and the flat style.
5. Desktop: sidebar from 8 sections to 4 (behavior change).
6. Desktop: editor layout (behavior change; overlaps the NIW2-611 work).

## Out of scope

The light theme redesign, track colors, any new feature.
