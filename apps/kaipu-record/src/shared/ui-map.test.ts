import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES } from "./routes";
import { ALL_AREA_IDS, UI_MAP, WINDOW_KINDS, areaStates, type ScreenSpec } from "./ui-map";

const SCREENS = Object.entries(UI_MAP as Record<string, ScreenSpec>);
const ROUTE_PATHS: readonly string[] = Object.values(ROUTES);

describe("ui-map", () => {
  it("takes no value import from a workspace package", () => {
    const source = readFileSync(resolve(__dirname, "ui-map.ts"), "utf8");
    const valueImports = source
      .split("\n")
      .filter((line) => /^import\s/.test(line) && !/^import\s+type\s/.test(line))
      .filter((line) => line.includes("@kaipu/"));
    expect(valueImports).toEqual([]);
  });

  it("gives every capturable screen at least one area", () => {
    const empty = SCREENS.filter(([, screen]) => {
      if ("redirect" in screen || "notCapturable" in screen) return false;
      return Object.keys(screen.areas).length === 0;
    }).map(([id]) => id);
    expect(empty).toEqual([]);
  });

  it("gives every area at least one state", () => {
    const empty = ALL_AREA_IDS.filter((id) => areaStates(id).length === 0);
    expect(empty).toEqual([]);
  });

  it("points route screens at ROUTES values or settings children", () => {
    const stray = SCREENS.flatMap(([id, screen]) =>
      screen.kind === "route" &&
      !ROUTE_PATHS.includes(screen.route) &&
      !screen.route.startsWith("/settings/")
        ? [id]
        : [],
    );
    expect(stray).toEqual([]);
  });

  it("has a window screen for every window kind", () => {
    const declared = SCREENS.flatMap(([, s]) => (s.kind === "window" ? [s.window] : []));
    expect([...declared].sort()).toEqual([...WINDOW_KINDS].sort());
  });
});
