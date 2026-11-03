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

  it("legacy names alias the new ones so consumers migrate part by part", () => {
    expect(dark["bg-app"]).toBe(dark["bg-canvas"]);
    expect(dark["bg-sidebar"]).toBe(dark["bg-panel"]);
    expect(dark["bg-card"]).toBe(dark["bg-raised"]);
    expect(dark["border"]).toBe(dark["line"]);
    expect(dark["text-primary"]).toBe(dark["text"]);
    expect(dark["text-muted"]).toBe(dark["text-3"]);
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
