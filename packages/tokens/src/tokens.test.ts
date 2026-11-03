import { describe, expect, it } from "vitest";
import { BASE_TOKEN_NAMES, THEME_TOKEN_NAMES, base, dark, light } from "./index";

describe("token sources", () => {
  it("dark carries the Kaipu Black values (NIW2-613)", () => {
    expect(dark["accent-primary"]).toBe("#f6055c");
    expect(dark["bg-canvas"]).toBe("#060607");
    expect(dark["bg-panel"]).toBe("#0b0b0d");
    expect(dark["bg-raised"]).toBe("#0e0e10");
    expect(dark["text"]).toBe("#f3f3f5");
    expect(dark["glow-accent"]).toBe("0 10px 26px -8px rgba(246, 5, 92, 0.75)");
  });

  // Every legacy name must keep the value of the new name it stands for, or a
  // surface migrating in parts 2-4 silently changes color.
  it.each([
    ["bg-app", "bg-canvas"],
    ["bg-sidebar", "bg-panel"],
    ["bg-card", "bg-raised"],
    ["bg-card-hover", "bg-hover"],
    ["bg-input", "bg-raised"],
    ["bg-modal", "bg-panel"],
    ["border", "line"],
    ["border-light", "line-strong"],
    ["text-primary", "text"],
    ["text-secondary", "text-2"],
    ["text-muted", "text-3"],
    ["accent-primary", "accent"],
    ["accent-primary-soft", "accent-soft"],
    ["accent-primary-ring", "accent-ring"],
  ] as const)("legacy %s aliases %s", (legacy, current) => {
    expect(dark[legacy]).toBe(dark[current]);
  });

  it("base carries the theme-invariant values verbatim", () => {
    expect(base["space-md"]).toBe("12px");
    expect(base["radius-lg"]).toBe("8px");
    expect(base["titlebar-height"]).toBe("38px");
    expect(base["transition"]).toBe("150ms ease");
  });

  it("every declared token name has a value in every set", () => {
    // TokenSet already enforces this at compile time; this guards the arrays
    // and the objects against drifting apart at runtime too.
    for (const name of THEME_TOKEN_NAMES) {
      expect(dark[name], `dark.${name}`).toBeTruthy();
      expect(light[name], `light.${name}`).toBeTruthy();
    }
    for (const name of BASE_TOKEN_NAMES) {
      expect(base[name], `base.${name}`).toBeTruthy();
    }
  });
});
