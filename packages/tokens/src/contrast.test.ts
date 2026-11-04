import { describe, expect, it } from "vitest";
import { dark } from "./themes/dark";
import { light } from "./themes/light";

/** WCAG relative luminance from a #rrggbb hex. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two #rrggbb hex colors. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Every text token must be readable on every surface it can sit on.
const TEXT_TOKENS = ["text-primary", "text-secondary", "text-muted"] as const;
const SURFACE_TOKENS = [
  "bg-app",
  "bg-sidebar",
  "bg-card",
  "bg-card-hover",
  "bg-input",
  "bg-modal",
] as const;

const DARK_TEXT = ["text", "text-2", "text-3", "text-4"] as const;
const DARK_SURFACES = ["bg-canvas", "bg-panel", "bg-raised", "bg-hover", "bg-active"] as const;

describe("light theme", () => {
  it("is no longer the dark placeholder", () => {
    expect(light).not.toEqual(dark);
  });

  it("keeps the brand accent identical to dark", () => {
    expect(light["accent-primary"]).toBe(dark["accent-primary"]);
    expect(light["accent-primary-hover"]).toBe(dark["accent-primary-hover"]);
  });

  it.each(TEXT_TOKENS.flatMap((t) => SURFACE_TOKENS.map((s) => [t, s] as const)))(
    "light %s on %s meets WCAG AA (4.5:1)",
    (text, surface) => {
      expect(contrast(light[text], light[surface])).toBeGreaterThanOrEqual(4.5);
    },
  );

  // Semantic accents are non-text UI (status dots, badges, icons) — WCAG 1.4.11
  // non-text contrast: >= 3:1 against the surfaces they sit on. bg-app, bg-card,
  // and bg-sidebar cover the three distinct light surface values (#fafafa /
  // #ffffff / #f4f4f5).
  const SEMANTIC_ACCENTS = [
    "accent-primary",
    "accent-green",
    "accent-red",
    "accent-yellow",
    "accent-purple",
  ] as const;
  const ACCENT_SURFACES = ["bg-app", "bg-card", "bg-sidebar"] as const;

  it.each(SEMANTIC_ACCENTS.flatMap((a) => ACCENT_SURFACES.map((s) => [a, s] as const)))(
    "light %s on %s meets WCAG non-text contrast (3:1)",
    (accent, surface) => {
      expect(contrast(light[accent], light[surface])).toBeGreaterThanOrEqual(3);
    },
  );
});

// The dark palette (Kaipu Black) is held to the same bar for every text level,
// `text-4` included: since NIW2-626 it carries small labels that mean something
// (section and track names), so it has to be readable, not decorative.
describe("dark theme", () => {
  it.each(DARK_TEXT.flatMap((t) => DARK_SURFACES.map((s) => [t, s] as const)))(
    "dark %s on %s meets WCAG AA (4.5:1)",
    (text, surface) => {
      expect(contrast(dark[text], dark[surface])).toBeGreaterThanOrEqual(4.5);
    },
  );
});
