import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TITLE_BAR_HEIGHT,
  hasTitleBarOverlay,
  mainWindowChrome,
  titleBarOverlay,
} from "./window-chrome";

const tokens = readFileSync(join(__dirname, "../../../../packages/tokens/css/tokens.css"), "utf8");

/** The value of `--name` inside the token block that starts at `selector`. */
function token(selector: string, name: string): string {
  const block = tokens.slice(tokens.indexOf(selector));
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`--${name} not found after ${selector}`);
  return match[1].trim();
}

describe("mainWindowChrome", () => {
  it("keeps the traffic lights on macOS, centred in the bar", () => {
    expect(mainWindowChrome("darwin", "dark")).toEqual({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 14 },
    });
  });

  it.each(["win32", "linux"] as const)(
    "uses the native caption-button overlay on %s",
    (platform) => {
      expect(mainWindowChrome(platform, "dark")).toEqual({
        titleBarStyle: "hidden",
        titleBarOverlay: { color: "#0b0b0d", symbolColor: "#c8c8d0", height: TITLE_BAR_HEIGHT },
      });
    },
  );

  it("only colors an overlay off macOS", () => {
    expect(hasTitleBarOverlay("darwin")).toBe(false);
    expect(hasTitleBarOverlay("win32")).toBe(true);
    expect(hasTitleBarOverlay("linux")).toBe(true);
  });
});

describe("titleBarOverlay", () => {
  // The overlay is painted by the OS, not by CSS, so it cannot read the tokens: this keeps
  // the copied colors honest when the palette changes.
  it("matches the bar's tokens in both themes", () => {
    expect(titleBarOverlay("dark")).toMatchObject({
      color: token(":root", "bg-sidebar"),
      symbolColor: token(":root", "text-secondary"),
    });
    expect(titleBarOverlay("light")).toMatchObject({
      color: token('[data-theme="light"]', "bg-sidebar"),
      symbolColor: token('[data-theme="light"]', "text-secondary"),
    });
  });
});
