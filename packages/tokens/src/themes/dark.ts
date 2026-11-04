import type { TokenSet } from "../types";

/**
 * Kaipu Black (NIW2-613): a deeper black with flush panels separated by one
 * hairline. The new names (`bg-canvas`, `line`, `text-2`, …) are the target
 * vocabulary; the legacy names (`bg-app`, `border`, `text-muted`, …) stay and
 * alias the same values so consumers migrate part by part, not in one rename.
 */
const canvas = "#060607"; // behind the video and main content areas
const panel = "#0b0b0d"; // sidebar, header, inspector, transport, timeline
const raised = "#0e0e10"; // timeline tracks, inputs, list rows
const hover = "#17171a";
const active = "#202024";
const line = "rgba(255, 255, 255, 0.08)"; // the only separator
const lineStrong = "rgba(255, 255, 255, 0.14)"; // input and secondary-button borders
// The text ladder (NIW2-626): pure white glared on the deeper black, and the old
// text-3/text-4 were too dim to read at small sizes. Every level clears WCAG AA on
// every surface (contrast.test.ts); text-4 is the floor, 6.26:1 on bg-raised.
const text1 = "#e8e8ed"; // primary text
const text2 = "#c8c8d0"; // secondary text
const text3 = "#a1a1aa"; // supporting text, inactive navigation
const text4 = "#92929c"; // small labels that still mean something: sections, tracks
const accent = "#f6055c";
const accentSoft = "rgba(246, 5, 92, 0.14)";
const accentRing = "rgba(246, 5, 92, 0.5)";

/** The Kaipu dark theme. */
export const dark: TokenSet = {
  "bg-canvas": canvas,
  "bg-panel": panel,
  "bg-raised": raised,
  "bg-hover": hover,
  "bg-active": active,
  line,
  "line-strong": lineStrong,
  text: text1,
  "text-2": text2,
  "text-3": text3,
  "text-4": text4,
  accent,
  "accent-soft": accentSoft,
  "accent-ring": accentRing,
  "shadow-popover": "0 24px 60px -18px rgba(0, 0, 0, 0.75)",

  // Legacy names, same values.
  "bg-app": canvas,
  "bg-sidebar": panel,
  "bg-card": raised,
  "bg-card-hover": hover,
  "bg-input": raised,
  "bg-modal": panel,
  "bg-overlay": "rgba(0, 0, 0, 0.72)",
  border: line,
  "border-light": lineStrong,
  "text-primary": text1,
  "text-secondary": text2,
  "text-muted": text3,
  "accent-primary": accent,
  "accent-primary-hover": "#d4044f",
  "accent-primary-soft": accentSoft,
  "accent-primary-tint": "rgba(246, 5, 92, 0.12)",
  "accent-primary-ring": accentRing,
  "glow-accent": "0 10px 26px -8px rgba(246, 5, 92, 0.75)",
  "accent-green": "#22c55e",
  "accent-red": "#ef4444",
  "accent-red-hover": "#dc2626",
  "accent-yellow": "#eab308",
  "accent-purple": "#a855f7",
};
