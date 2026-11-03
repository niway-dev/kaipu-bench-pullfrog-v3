import type { BrowserWindowConstructorOptions, TitleBarOverlay } from "electron";
import type { Theme } from "@shared/types";

/**
 * The main window draws its own title bar (NIW2-621): the Kaipu logo, the name and the
 * workspace switcher sit in the window chrome instead of a row below it. The OS still
 * draws its own window controls, on the side it always does:
 *
 * - macOS: the traffic lights, top left, over our bar (`hiddenInset`), centred in it.
 * - Windows / Linux: minimize / maximize / close, top right, as a native overlay
 *   (`titleBarOverlay`), painted in the bar's color so the two read as one strip.
 *
 * The renderer's bar (`shell/title-bar.tsx`) is `TITLE_BAR_HEIGHT` tall and leaves the
 * controls' side empty.
 */
export const TITLE_BAR_HEIGHT = 40;

/** The traffic lights are 12 px tall: this centres them in the bar, 16 px from the edge. */
const TRAFFIC_LIGHTS = { x: 16, y: (TITLE_BAR_HEIGHT - 12) / 2 } as const;

/** `--bg-sidebar` and `--text-secondary` of each theme (packages/tokens/css/tokens.css). */
const OVERLAY_COLORS: Record<Theme, { color: string; symbolColor: string }> = {
  dark: { color: "#0b0b0d", symbolColor: "#c8c8d0" },
  light: { color: "#f4f4f5", symbolColor: "#52525b" },
};

/** The Windows / Linux caption-button overlay for a theme. */
export function titleBarOverlay(theme: Theme): TitleBarOverlay {
  return { ...OVERLAY_COLORS[theme], height: TITLE_BAR_HEIGHT };
}

/** True where the OS controls are an overlay we color (`setTitleBarOverlay` exists there). */
export function hasTitleBarOverlay(platform: NodeJS.Platform): boolean {
  return platform !== "darwin";
}

/** The main window's title bar options for a platform and theme. */
export function mainWindowChrome(
  platform: NodeJS.Platform,
  theme: Theme,
): Pick<
  BrowserWindowConstructorOptions,
  "titleBarStyle" | "trafficLightPosition" | "titleBarOverlay"
> {
  if (platform === "darwin") {
    return { titleBarStyle: "hiddenInset", trafficLightPosition: { ...TRAFFIC_LIGHTS } };
  }
  return { titleBarStyle: "hidden", titleBarOverlay: titleBarOverlay(theme) };
}
